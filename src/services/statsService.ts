interface AppStats {
  totalTranslations: number;
  totalWords: number;
  totalUploads: number;
  dailyStats: {
    date: string;
    translations: number;
    uploads: number;
    words: number;
  }[];
  recentActivity: {
    id: string;
    user: string;
    action: string;
    time: number;
    lang?: string;
  }[];
}

const STORAGE_KEY = 'unika_app_stats';

const getInitialStats = (): AppStats => ({
  totalTranslations: 0,
  totalWords: 0,
  totalUploads: 0,
  dailyStats: [],
  recentActivity: []
});

let cachedData: any = {
  stats: getInitialStats(),
  apiKeys: [],
  config: {
    spreadsheetId: '',
    webAppUrl: '',
    syncMethod: 'webapp'
  }
};
let saveTimeout: any = null;
let isSyncing = false;
let isLoaded = false;
const syncListeners: ((status: boolean) => void)[] = [];
const dataListeners: ((data: any) => void)[] = [];
const pdfListeners: ((fileName: string) => void)[] = [];
let ws: WebSocket | null = null;

function connectWS() {
  if (typeof window === 'undefined') return;
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'DATA_UPDATE' || message.type === 'PDF_UPDATE') {
        const data = message.data;
        
        // Merge with local data to avoid overwriting unsaved local changes
        // We prioritize local stats and apiKeys if we are in the middle of a save
        cachedData = {
          ...cachedData,
          ...data,
          stats: {
            ...data.stats,
            // If we have local stats that are "ahead", we might want to keep them,
            // but usually the server is the source of truth for stats.
          },
          config: {
            ...cachedData.config,
            ...data.config
          }
        };
        
        // If we are not currently saving, we can safely take the server's apiKeys
        if (!saveTimeout) {
          cachedData.apiKeys = data.apiKeys;
        }
        
        // Update local storage as a cache
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedData.stats));
        localStorage.setItem('unika_api_keys', JSON.stringify(cachedData.apiKeys));
        localStorage.setItem('unika_spreadsheet_id', cachedData.config.spreadsheetId);
        localStorage.setItem('unika_webapp_url', cachedData.config.webAppUrl);
        localStorage.setItem('unika_sync_method', cachedData.config.syncMethod);
        
        // Notify listeners
        dataListeners.forEach(cb => cb(cachedData));
        
        if (message.type === 'PDF_UPDATE' && data.config.currentFile) {
          pdfListeners.forEach(cb => cb(data.config.currentFile));
        }
      }
    } catch (e) {
      console.error("WS message error", e);
    }
  };
  
  ws.onclose = () => {
    setTimeout(connectWS, 3000); // Reconnect after 3s
  };
}

export const statsService = {
  onDataUpdate: (callback: (data: any) => void) => {
    dataListeners.push(callback);
    return () => {
      const index = dataListeners.indexOf(callback);
      if (index > -1) dataListeners.splice(index, 1);
    };
  },

  onPdfUpdate: (callback: (fileName: string) => void) => {
    pdfListeners.push(callback);
    return () => {
      const index = pdfListeners.indexOf(callback);
      if (index > -1) pdfListeners.splice(index, 1);
    };
  },

  onSyncStatusChange: (callback: (status: boolean) => void) => {
    syncListeners.push(callback);
    return () => {
      const index = syncListeners.indexOf(callback);
      if (index > -1) syncListeners.splice(index, 1);
    };
  },

  setSyncing: (status: boolean) => {
    isSyncing = status;
    syncListeners.forEach(cb => cb(status));
  },

  getSyncing: () => isSyncing,

  init: async () => {
    connectWS();
    try {
      const res = await fetch('/api/data');
      const data = await res.json();
      
      // Merge fetched data with current cachedData (which might have been updated by WS)
      cachedData = {
        ...data,
        ...cachedData,
        // We trust the server's stats and apiKeys for the initial load
        stats: data.stats || cachedData.stats,
        apiKeys: data.apiKeys || cachedData.apiKeys,
        config: {
          ...data.config,
          ...cachedData.config
        }
      };
      
      isLoaded = true;
      
      // Update local storage as a cache
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.stats));
      localStorage.setItem('unika_api_keys', JSON.stringify(data.apiKeys));
      localStorage.setItem('unika_spreadsheet_id', data.config.spreadsheetId);
      localStorage.setItem('unika_webapp_url', data.config.webAppUrl);
      localStorage.setItem('unika_sync_method', data.config.syncMethod);
      
      // Notify listeners
      dataListeners.forEach(cb => cb(data));
      
      return cachedData;
    } catch (e) {
      console.error("Failed to init data from server", e);
      // Fallback to localStorage if server fails
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        cachedData.stats = JSON.parse(saved);
        isLoaded = true;
      }
    }
  },

  getStats: (): AppStats => {
    return cachedData.stats;
  },

  trackTranslation: async (text: string, lang: string) => {
    const stats = statsService.getStats();
    const wordCount = text.split(/\s+/).length;
    const today = new Date().toISOString().split('T')[0];

    stats.totalTranslations += 1;
    stats.totalWords += wordCount;

    // Update daily stats
    const dayIndex = stats.dailyStats.findIndex(d => d.date === today);
    if (dayIndex > -1) {
      stats.dailyStats[dayIndex].translations += 1;
      stats.dailyStats[dayIndex].words += wordCount;
    } else {
      stats.dailyStats.push({
        date: today,
        translations: 1,
        uploads: 0,
        words: wordCount
      });
    }

    // Keep only last 30 days
    if (stats.dailyStats.length > 30) stats.dailyStats.shift();

    // Add activity
    stats.recentActivity.unshift({
      id: Date.now().toString(),
      user: 'Guest Reader',
      action: `Translated ${wordCount} words`,
      time: Date.now(),
      lang
    });

    // Keep only last 50 activities
    if (stats.recentActivity.length > 50) stats.recentActivity.pop();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    await statsService.saveToServer();
  },

  trackUpload: async (fileName: string) => {
    const stats = statsService.getStats();
    const today = new Date().toISOString().split('T')[0];

    stats.totalUploads += 1;

    const dayIndex = stats.dailyStats.findIndex(d => d.date === today);
    if (dayIndex > -1) {
      stats.dailyStats[dayIndex].uploads += 1;
    } else {
      stats.dailyStats.push({
        date: today,
        translations: 0,
        uploads: 1,
        words: 0
      });
    }

    stats.recentActivity.unshift({
      id: Date.now().toString(),
      user: 'Guest Reader',
      action: `Uploaded "${fileName}"`,
      time: Date.now()
    });

    if (stats.recentActivity.length > 50) stats.recentActivity.pop();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    await statsService.saveToServer();
  },

  saveToServer: async () => {
    if (!isLoaded) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(async () => {
      const data = statsService.getAllData();
      const config = cachedData.config;

      try {
        await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stats: {
              totalTranslations: data.summary.totalTranslations,
              totalWords: data.summary.totalWords,
              totalUploads: data.summary.totalUploads,
              dailyStats: data.dailyStats,
              recentActivity: data.recentActivity
            },
            apiKeys: data.apiKeys,
            config
          })
        });
        // Automatically trigger sync to sheets after saving to server
        statsService.triggerSync();
      } catch (e) {
        console.error("Failed to save data to server", e);
      } finally {
        saveTimeout = null;
      }
    }, 1000); // 1 second debounce
  },

  triggerSync: async () => {
    const url = cachedData.config.webAppUrl;
    const method = cachedData.config.syncMethod;
    
    if (url && method === 'webapp') {
      statsService.setSyncing(true);
      try {
        const data = statsService.getAllData();
        await fetch('/api/sheets/sync-webapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, data })
        });
      } catch (e) {
        console.error("Background sync failed", e);
      } finally {
        statsService.setSyncing(false);
      }
    }
  },

  getAllData: () => {
    const stats = cachedData.stats;
    const apiKeys = cachedData.apiKeys;
    const config = cachedData.config;
    
    return {
      summary: {
        totalTranslations: stats.totalTranslations,
        totalWords: stats.totalWords,
        totalUploads: stats.totalUploads
      },
      dailyStats: stats.dailyStats,
      recentActivity: stats.recentActivity,
      apiKeys: apiKeys,
      config: config,
      stats: stats
    };
  },

  updateConfig: (newConfig: Partial<any>) => {
    cachedData.config = { ...cachedData.config, ...newConfig };
    statsService.saveToServer();
  },

  updateApiKeys: (newKeys: any[]) => {
    cachedData.apiKeys = newKeys;
    statsService.saveToServer();
  },

  getActiveApiKey: () => {
    const activeKey = cachedData.apiKeys.find((k: any) => k.active);
    return activeKey ? activeKey.key : null;
  }
};
