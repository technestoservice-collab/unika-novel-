import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  BarChart3, 
  Languages, 
  FileText, 
  ShieldCheck,
  TrendingUp,
  Activity,
  ArrowLeft,
  Key,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Globe,
  Table,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion } from 'motion/react';
import { statsService } from '../services/statsService';

const COLORS = ['#d97706', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

interface AdminPanelProps {
  onBack: () => void;
}

export default function AdminPanel({ onBack }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apiKeys, setApiKeys] = useState<{ id: string, name: string, key: string, active: boolean }[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [stats, setStats] = useState(statsService.getStats());
  const [isGoogleLinked, setIsGoogleLinked] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState(localStorage.getItem('unika_spreadsheet_id') || '1vil6J5cubtv08zuR__MS5QxOnZE9tHNl9yUd8xVcZOI');
  const [webAppUrl, setWebAppUrl] = useState(localStorage.getItem('unika_webapp_url') || 'https://script.google.com/macros/s/AKfycbyJtkjjZkNUD_tG_20HiIHrCY06uDDBGA4aJnQmcFabawtuvnW2mXrQzBStt3zAqCi0lQ/exec');
  const [isEditingId, setIsEditingId] = useState(false);
  const [tempId, setTempId] = useState('');
  const [syncMethod, setSyncMethod] = useState<'oauth' | 'webapp'>(localStorage.getItem('unika_sync_method') as any || 'webapp');

  useEffect(() => {
    const savedKeys = localStorage.getItem('unika_api_keys');
    if (savedKeys) {
      setApiKeys(JSON.parse(savedKeys));
    }
    
    checkGoogleStatus();
    
    // Refresh stats
    setStats(statsService.getStats());
    const interval = setInterval(() => {
      setStats(statsService.getStats());
    }, 5000);

    // Subscribe to sync status
    const unsubscribeSync = statsService.onSyncStatusChange((status) => {
      setIsSyncing(status);
    });

    // Subscribe to data updates
    const unsubscribeData = statsService.onDataUpdate((data) => {
      setStats(data.stats);
      setApiKeys(data.apiKeys);
      setSpreadsheetId(data.config.spreadsheetId);
      setWebAppUrl(data.config.webAppUrl);
      setSyncMethod(data.config.syncMethod);
    });

    return () => {
      clearInterval(interval);
      unsubscribeSync();
      unsubscribeData();
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setIsGoogleLinked(true);
        statsService.saveToServer();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [spreadsheetId]);

  const checkGoogleStatus = async () => {
    try {
      const res = await fetch('/api/auth/google/status');
      const data = await res.json();
      setIsGoogleLinked(data.isAuthenticated);
    } catch (e) {
      console.error("Error checking Google status", e);
    }
  };

  const connectGoogle = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (e) {
      alert("Failed to get Google Auth URL. Check server logs.");
    }
  };

  const saveManualId = () => {
    setSpreadsheetId(tempId);
    localStorage.setItem('unika_spreadsheet_id', tempId);
    setIsEditingId(false);
    statsService.saveToServer();
    alert("Spreadsheet ID updated!");
  };

  const saveKeys = (keys: any[]) => {
    setApiKeys(keys);
    localStorage.setItem('unika_api_keys', JSON.stringify(keys));
    statsService.saveToServer();
  };

  const addApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName || !newKeyValue) return;

    const newKey = {
      id: Date.now().toString(),
      name: newKeyName,
      key: newKeyValue,
      active: true
    };

    const updatedKeys = apiKeys.map(k => ({ ...k, active: false }));
    saveKeys([...updatedKeys, newKey]);
    setNewKeyName('');
    setNewKeyValue('');
  };

  const deleteKey = (id: string) => {
    const updatedKeys = apiKeys.filter(k => k.id !== id);
    saveKeys(updatedKeys);
  };

  const toggleActive = (id: string) => {
    const updatedKeys = apiKeys.map(k => ({
      ...k,
      active: k.id === id
    }));
    saveKeys(updatedKeys);
  };

  const dashboardStats = [
    { label: 'Total Translations', value: stats.totalTranslations.toLocaleString(), icon: <Languages className="w-5 h-5" />, color: 'bg-blue-500' },
    { label: 'Total Words', value: stats.totalWords.toLocaleString(), icon: <Activity className="w-5 h-5" />, color: 'bg-emerald-500' },
    { label: 'Novels Uploaded', value: stats.totalUploads.toLocaleString(), icon: <FileText className="w-5 h-5" />, color: 'bg-amber-500' },
    { label: 'System Health', value: '99.9%', icon: <ShieldCheck className="w-5 h-5" />, color: 'bg-indigo-500' },
  ];

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Process data for language pie chart
  const langData = stats.recentActivity.reduce((acc: any, curr) => {
    if (curr.lang) {
      const existing = acc.find((d: any) => d.name === curr.lang);
      if (existing) existing.value += 1;
      else acc.push({ name: curr.lang, value: 1 });
    }
    return acc;
  }, []);

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-stone-900 text-stone-400 flex flex-col">
        <div className="p-6 flex items-center space-x-3 text-white">
          <ShieldCheck className="w-8 h-8 text-amber-500" />
          <span className="font-serif font-bold text-lg">Admin Console</span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
            { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-5 h-5" /> },
            { id: 'api-keys', label: 'API Keys', icon: <Key className="w-5 h-5" /> },
            { id: 'google-sheets', label: 'Google Sheets', icon: <Table className="w-5 h-5" /> },
            { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/20' 
                  : 'hover:bg-stone-800 hover:text-stone-200'
              }`}
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-stone-800">
          <button 
            onClick={onBack}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-stone-800 transition-all text-stone-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to App</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-stone-900">
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('-', ' ')}
            </h1>
            <p className="text-stone-500">Real-time system monitoring and configuration.</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Live Feed Connected</span>
            </div>
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-stone-900">Admin User</p>
              <p className="text-xs text-stone-500">Super Admin</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-stone-200 border-2 border-white shadow-sm overflow-hidden">
              <img src="https://picsum.photos/seed/admin/100/100" alt="Admin" referrerPolicy="no-referrer" />
            </div>
          </div>
        </header>

        {activeTab === 'google-sheets' && (
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-emerald-100 rounded-2xl">
                    <Table className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-stone-900">Google Sheets Integration</h3>
                    <p className="text-sm text-stone-500">Sync all your data, API keys, and analytics to a Google Spreadsheet.</p>
                  </div>
                </div>
                <div className="flex bg-stone-100 p-1 rounded-xl">
                  <button 
                    onClick={() => { setSyncMethod('oauth'); localStorage.setItem('unika_sync_method', 'oauth'); statsService.saveToServer(); }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${syncMethod === 'oauth' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
                  >
                    OAuth2
                  </button>
                  <button 
                    onClick={() => { setSyncMethod('webapp'); localStorage.setItem('unika_sync_method', 'webapp'); statsService.saveToServer(); }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${syncMethod === 'webapp' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
                  >
                    Web App URL
                  </button>
                </div>
              </div>

              {syncMethod === 'oauth' ? (
                <div className="flex items-center justify-between p-6 bg-stone-50 rounded-2xl border border-stone-100">
                  {!isGoogleLinked ? (
                    <div className="flex-1 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-stone-900">OAuth2 Connection</p>
                        <p className="text-xs text-stone-500">Connect your account to sync to a specific sheet.</p>
                      </div>
                      <button 
                        onClick={connectGoogle}
                        className="px-6 py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all flex items-center space-x-2"
                      >
                        <Globe className="w-5 h-5" />
                        <span>Connect Google Account</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="p-2 bg-white rounded-lg shadow-sm">
                            <FileText className="w-6 h-6 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-stone-900">Active Spreadsheet</p>
                            {isEditingId ? (
                              <div className="flex items-center mt-1 gap-2">
                                <input 
                                  type="text"
                                  value={tempId}
                                  onChange={(e) => setTempId(e.target.value)}
                                  className="text-xs p-1 border border-stone-200 rounded outline-none w-64"
                                  placeholder="Paste Sheet ID here"
                                />
                                <button onClick={saveManualId} className="text-[10px] font-bold text-emerald-600 hover:underline">SAVE</button>
                                <button onClick={() => setIsEditingId(false)} className="text-[10px] font-bold text-stone-400 hover:underline">CANCEL</button>
                              </div>
                            ) : (
                              <div className="flex items-center mt-1 gap-2">
                                <p className="text-xs text-stone-400 font-mono">{spreadsheetId || 'None set'}</p>
                                <button 
                                  onClick={() => { setTempId(spreadsheetId); setIsEditingId(true); }}
                                  className="text-[10px] font-bold text-amber-600 hover:underline"
                                >
                                  EDIT ID
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="flex items-center space-x-1 px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>CONNECTED</span>
                          </span>
                          <div className="flex items-center space-x-2 text-emerald-600 text-[10px] font-bold uppercase">
                            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                            <span>Auto-Syncing</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100">
                    <label className="text-xs font-bold text-stone-500 uppercase block mb-2">Google Apps Script Web App URL</label>
                    <div className="flex gap-3">
                      <input 
                        type="text"
                        value={webAppUrl}
                        onChange={(e) => {
                          setWebAppUrl(e.target.value);
                          localStorage.setItem('unika_webapp_url', e.target.value);
                          statsService.saveToServer();
                        }}
                        placeholder="https://script.google.com/macros/s/.../exec"
                        className="flex-1 p-3 bg-white border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      />
                      <div className="flex items-center px-4 bg-stone-100 rounded-xl space-x-2 text-emerald-600 text-[10px] font-bold uppercase">
                        <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>Auto-Sync Active</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-stone-400 mt-3">
                      Paste your deployed Web App URL here. Make sure your script has a <code>doPost(e)</code> handler.
                    </p>
                  </div>
                </div>
              )}

              {isGoogleLinked && spreadsheetId && syncMethod === 'oauth' && (
                <div className="mt-4 flex justify-end">
                  <a 
                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 text-emerald-600 font-bold text-sm hover:underline"
                  >
                    <span>Open in Sheets</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
                <h4 className="font-bold text-stone-900 mb-4">What gets synced?</h4>
                <ul className="space-y-3">
                  {[
                    { label: 'API Keys', desc: 'All configured Gemini API keys and their status.' },
                    { label: 'Daily Analytics', desc: 'Translation counts, word counts, and upload stats per day.' },
                    { label: 'Recent Activity', desc: 'The full history of user actions and translations.' },
                    { label: 'System Summary', desc: 'Overall platform totals and health metrics.' }
                  ].map((item, i) => (
                    <li key={i} className="flex items-start space-x-3">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-stone-800">{item.label}</p>
                        <p className="text-xs text-stone-500">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
                <h4 className="font-bold text-stone-900 mb-4">Sync Settings</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl">
                    <div>
                      <p className="text-sm font-bold text-stone-900">Auto-Sync</p>
                      <p className="text-xs text-stone-500">Sync data every 5 minutes</p>
                    </div>
                    <div className="w-12 h-6 bg-emerald-500 rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full transition-all" />
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Security Note</p>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    API keys are synced to the spreadsheet. Ensure your spreadsheet sharing settings are private to protect your keys.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {dashboardStats.map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-2xl ${stat.color} text-white`}>
                      {stat.icon}
                    </div>
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-stone-500 text-sm font-medium">{stat.label}</p>
                  <h3 className="text-2xl font-bold text-stone-900 mt-1">{stat.value}</h3>
                </motion.div>
              ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Chart */}
              <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-stone-900">Translation Activity</h3>
                  <div className="flex items-center space-x-2 text-xs font-bold text-stone-400">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span>Translations</span>
                  </div>
                </div>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.dailyStats.length > 0 ? stats.dailyStats : [{date: 'No Data', translations: 0}]}>
                      <defs>
                        <linearGradient id="colorTrans" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#d97706" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#a8a29e', fontSize: 10}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#a8a29e', fontSize: 10}} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Area type="monotone" dataKey="translations" stroke="#d97706" strokeWidth={3} fillOpacity={1} fill="url(#colorTrans)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent Activity Mini */}
              <div className="bg-white rounded-3xl shadow-sm border border-stone-100 flex flex-col">
                <div className="p-6 border-b border-stone-100">
                  <h3 className="text-lg font-bold text-stone-900">Live Feed</h3>
                </div>
                <div className="flex-1 overflow-auto max-h-[400px]">
                  {stats.recentActivity.length === 0 ? (
                    <div className="p-8 text-center text-stone-400 text-sm">No activity yet.</div>
                  ) : (
                    stats.recentActivity.slice(0, 10).map((activity) => (
                      <div key={activity.id} className="p-4 border-b border-stone-50 flex items-start space-x-3 hover:bg-stone-50 transition-colors">
                        <div className="mt-1 w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-stone-800">{activity.action}</p>
                          <p className="text-[10px] text-stone-400">{formatTime(activity.time)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-8">
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
                <h3 className="text-lg font-bold text-stone-900 mb-6">Word Count Trends</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.dailyStats}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#a8a29e', fontSize: 10}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#a8a29e', fontSize: 10}} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="words" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
                <h3 className="text-lg font-bold text-stone-900 mb-6">Language Distribution</h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={langData.length > 0 ? langData : [{name: 'No Data', value: 1}]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {(langData.length > 0 ? langData : [{name: 'No Data', value: 1}]).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {langData.map((entry: any, index: number) => (
                    <div key={entry.name} className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-xs font-medium text-stone-500">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
              <h3 className="text-lg font-bold text-stone-900 mb-6">Upload Statistics</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#a8a29e', fontSize: 10}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#a8a29e', fontSize: 10}} />
                    <Tooltip />
                    <Area type="step" dataKey="uploads" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'api-keys' && (
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
              <h3 className="text-xl font-bold text-stone-900 mb-6">Add New API Key</h3>
              <form onSubmit={addApiKey} className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase">Key Name</label>
                  <input 
                    type="text" 
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Primary Key"
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase">Gemini API Key</label>
                  <input 
                    type="password" 
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    placeholder="AIza..."
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="flex items-end">
                  <button 
                    type="submit"
                    className="w-full py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-all flex items-center justify-center space-x-2"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Add Key</span>
                  </button>
                </div>
              </form>
              <p className="text-xs text-stone-400 mt-4 italic">
                Adding a new key will automatically set it as the active key for all translations.
              </p>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
              <div className="p-8 border-b border-stone-100">
                <h3 className="text-xl font-bold text-stone-900">Configured Keys</h3>
              </div>
              <div className="divide-y divide-stone-100">
                {apiKeys.length === 0 ? (
                  <div className="p-12 text-center text-stone-400">
                    <Key className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No custom API keys added yet.</p>
                    <p className="text-xs">Using default system key from environment.</p>
                  </div>
                ) : (
                  apiKeys.map((key) => (
                    <div key={key.id} className="p-6 flex items-center justify-between hover:bg-stone-50 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${key.active ? 'bg-amber-100 text-amber-600' : 'bg-stone-100 text-stone-400'}`}>
                          <Key className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <p className="text-sm font-bold text-stone-900">{key.name}</p>
                            {key.active && (
                              <span className="flex items-center space-x-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>ACTIVE</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-500 font-mono">
                            {key.key.substring(0, 8)}••••••••{key.key.substring(key.key.length - 4)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {!key.active && (
                          <button 
                            onClick={() => toggleActive(key.id)}
                            className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-lg transition-all"
                          >
                            Set Active
                          </button>
                        )}
                        <button 
                          onClick={() => deleteKey(key.id)}
                          className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
            <h3 className="text-xl font-bold text-stone-900 mb-8">System Settings</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-stone-700">Default Translation Model</label>
                <select className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500">
                  <option>Gemini 3 Flash (Recommended)</option>
                  <option>Gemini 3 Pro</option>
                  <option>Gemini 2.5 Flash</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-stone-700">Max Upload Size (MB)</label>
                <input type="number" defaultValue={50} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl">
                <div>
                  <p className="text-sm font-bold text-stone-900">Maintenance Mode</p>
                  <p className="text-xs text-stone-500">Disable uploads and translations</p>
                </div>
                <div className="w-12 h-6 bg-stone-300 rounded-full relative cursor-pointer">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all" />
                </div>
              </div>
              <button className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all mt-4">
                Save Changes
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
