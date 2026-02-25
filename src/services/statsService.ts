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

export const statsService = {
  getStats: (): AppStats => {
    if (typeof window === 'undefined') return getInitialStats();
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : getInitialStats();
  },

  trackTranslation: (text: string, lang: string) => {
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
    statsService.triggerSync();
  },

  trackUpload: (fileName: string) => {
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
    statsService.triggerSync();
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
