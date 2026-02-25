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

let cachedData: any = null;

const getInitialStats = (): AppStats => ({
  totalTranslations: 0,
  totalWords: 0,
  totalUploads: 0,
  dailyStats: [],
  recentActivity: []
});

export const statsService = {
  init: async () => {
    try {
      const res = await fetch('/api/data');
      cachedData = await res.json();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedData.stats));
      localStorage.setItem('unika_api_keys', JSON.stringify(cachedData.apiKeys));
      localStorage.setItem('unika_spreadsheet_id', cachedData.config.spreadsheetId);
      localStorage.setItem('unika_webapp_url', cachedData.config.webAppUrl);
      localStorage.setItem('unika_sync_method', cachedData.config.syncMethod);
      return cachedData;
    } catch (e) {
      console.error("Failed to init data from server", e);
    }
  },

  getStats: (): AppStats => {
    if (typeof window === 'undefined') return getInitialStats();
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : getInitialStats();
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
    statsService.triggerSync();
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
    statsService.triggerSync();
  },

  saveToServer: async () => {
    const data = statsService.getAllData();
    const config = {
      spreadsheetId: localStorage.getItem('unika_spreadsheet_id') || '',
      webAppUrl: localStorage.getItem('unika_webapp_url') || '',
      syncMethod: localStorage.getItem('unika_sync_method') || 'webapp'
    };

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
    } catch (e) {
      console.error("Failed to save data to server", e);
    }
  },

  triggerSync: async () => {
    const url = localStorage.getItem('unika_webapp_url');
    const method = localStorage.getItem('unika_sync_method');
    
    if (url && method === 'webapp') {
      try {
        const data = statsService.getAllData();
        await fetch('/api/sheets/sync-webapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, data })
        });
      } catch (e) {
        console.error("Background sync failed", e);
      }
    }
  },

  getAllData: () => {
    const stats = statsService.getStats();
    const savedKeys = localStorage.getItem('unika_api_keys');
    const apiKeys = savedKeys ? JSON.parse(savedKeys) : [];
    
    return {
      summary: {
        totalTranslations: stats.totalTranslations,
        totalWords: stats.totalWords,
        totalUploads: stats.totalUploads
      },
      dailyStats: stats.dailyStats,
      recentActivity: stats.recentActivity,
      apiKeys: apiKeys
    };
  }
};
