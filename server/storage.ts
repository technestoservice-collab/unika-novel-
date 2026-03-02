import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_PATH = path.join(__dirname, 'data', 'storage.json');

interface AppData {
  stats: {
    totalTranslations: number;
    totalWords: number;
    totalUploads: number;
    dailyStats: any[];
    recentActivity: any[];
  };
  apiKeys: any[];
  config: {
    spreadsheetId: string;
    webAppUrl: string;
    syncMethod: string;
    currentFile?: string;
  };
}

const DEFAULT_DATA: AppData = {
  stats: {
    totalTranslations: 0,
    totalWords: 0,
    totalUploads: 0,
    dailyStats: [],
    recentActivity: []
  },
  apiKeys: [],
  config: {
    spreadsheetId: '1vil6J5cubtv08zuR__MS5QxOnZE9tHNl9yUd8xVcZOI',
    webAppUrl: 'https://script.google.com/macros/s/AKfycbymp3eNJv9s5lHif_UBSrHfh3KWl5PDbdprTzUVuYx0gCnl9fqa1JC6O0djc2mBdZo/exec',
    syncMethod: 'webapp',
    currentFile: ''
  }
};

export async function ensureStorage() {
  try {
    await fs.mkdir(path.dirname(STORAGE_PATH), { recursive: true });
    try {
      await fs.access(STORAGE_PATH);
    } catch {
      await fs.writeFile(STORAGE_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
    }
  } catch (error) {
    console.error('Error ensuring storage:', error);
  }
}

export async function getData(): Promise<AppData> {
  try {
    const content = await fs.readFile(STORAGE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return DEFAULT_DATA;
  }
}

export async function saveData(data: AppData) {
  try {
    await fs.writeFile(STORAGE_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}
