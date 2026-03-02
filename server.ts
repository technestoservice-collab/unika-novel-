import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import session from "express-session";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { ensureStorage, getData, saveData } from "./server/storage.js";

dotenv.config();

declare module 'express-session' {
  interface SessionData {
    tokens: any;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: "unika-secret-key",
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: true, 
    sameSite: 'none',
    httpOnly: true 
  }
}));

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/auth/google/callback`
);

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];

// Auth Routes
app.get("/api/auth/google/url", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ url });
});

app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    // In a real app, store these in a database. For now, we'll use session.
    (req.session as any).tokens = tokens;
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error getting tokens:", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/api/auth/google/status", (req, res) => {
  res.json({ isAuthenticated: !!(req.session as any).tokens });
});

// Data Persistence Endpoints
app.get("/api/data", async (req, res) => {
  const data = await getData();
  res.json(data);
});

app.post("/api/data", async (req, res) => {
  await saveData(req.body);
  // Broadcast to all connected clients
  broadcastData(req.body);
  res.json({ success: true });
});

let wss: WebSocketServer;

function broadcastData(data: any) {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'DATA_UPDATE', data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Google Sheets Sync
app.post("/api/sheets/sync", async (req, res) => {
  const tokens = (req.session as any).tokens;
  if (!tokens) {
    return res.status(401).json({ error: "Not authenticated with Google" });
  }

  const { data, spreadsheetId: existingId } = req.body;
  oauth2Client.setCredentials(tokens);
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  try {
    let spreadsheetId = existingId;

    // 1. Create spreadsheet if it doesn't exist
    if (!spreadsheetId) {
      const resource = {
        properties: { title: "Unika Nobel Translator Data" },
      };
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: resource,
        fields: 'spreadsheetId',
      });
      spreadsheetId = spreadsheet.data.spreadsheetId;

      // Setup sheets
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: 'API Keys' } } },
            { addSheet: { properties: { title: 'Daily Stats' } } },
            { addSheet: { properties: { title: 'Recent Activity' } } },
            { addSheet: { properties: { title: 'Summary' } } },
            { deleteSheet: { sheetId: 0 } } // Delete default Sheet1
          ]
        }
      });
    }

    // 2. Sync API Keys
    if (data.apiKeys) {
      const values = [
        ['ID', 'Name', 'Key', 'Active'],
        ...data.apiKeys.map((k: any) => [k.id, k.name, k.key, k.active ? 'Yes' : 'No'])
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "'API Keys'!A1",
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    }

    // 3. Sync Daily Stats
    if (data.dailyStats) {
      const values = [
        ['Date', 'Translations', 'Uploads', 'Words'],
        ...data.dailyStats.map((s: any) => [s.date, s.translations, s.uploads, s.words])
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "'Daily Stats'!A1",
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    }

    // 4. Sync Recent Activity
    if (data.recentActivity) {
      const values = [
        ['ID', 'User', 'Action', 'Time', 'Language'],
        ...data.recentActivity.map((a: any) => [a.id, a.user, a.action, new Date(a.time).toLocaleString(), a.lang || 'N/A'])
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "'Recent Activity'!A1",
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    }

    // 5. Sync Summary
    if (data.summary) {
      const values = [
        ['Metric', 'Value'],
        ['Total Translations', data.summary.totalTranslations],
        ['Total Words', data.summary.totalWords],
        ['Total Uploads', data.summary.totalUploads],
        ['Last Synced', new Date().toLocaleString()]
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "'Summary'!A1",
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    }

    res.json({ success: true, spreadsheetId });
  } catch (error: any) {
    console.error("Sheets sync error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Sync via Web App URL (No OAuth required)
app.post("/api/sheets/sync-webapp", async (req, res) => {
  const { url, data } = req.body;
  if (!url) return res.status(400).json({ error: "Web App URL is required" });

  console.log(`Attempting sync to: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      redirect: 'follow'
    });
    
    const status = response.status;
    const result = await response.text();
    
    console.log(`Apps Script Response (${status}):`, result);

    if (status >= 400) {
      throw new Error(`Google Apps Script returned status ${status}: ${result}`);
    }

    res.json({ success: true, response: result });
  } catch (error: any) {
    console.error("Web App sync error:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Ensure your Apps Script is deployed as 'Anyone' and has a doPost(e) function."
    });
  }
});

// Pull from Web App URL
app.get("/api/sheets/pull", async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).json({ error: "Web App URL is required" });

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("Web App pull error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development
async function startServer() {
  await ensureStorage();
  
  const httpServer = createServer(app);

  wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    // Send initial data on connection
    getData().then(data => {
      ws.send(JSON.stringify({ type: 'DATA_UPDATE', data }));
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
