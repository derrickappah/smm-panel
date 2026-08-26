import React, { memo, useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Save,
  Search,
  Database,
  Server,
  CreditCard,
  Sliders,
  Zap,
  CheckCircle2,
  AlertCircle,
  Undo2,
  Lock,
  Layers,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';

// Provider definitions with their associated keys
const PROVIDER_PRESETS = [
  // SMM Providers
  {
    id: 'smmgen',
    name: 'SMMGen',
    category: 'smm',
    icon: Server,
    color: 'from-blue-600 to-indigo-600',
    description: 'Primary SMM service provider endpoint & API authentication',
    keys: [
      { key: 'SMMGEN_API_URL', label: 'API URL', default: 'https://smmgen.com/api/v2', isSecret: false, placeholder: 'https://smmgen.com/api/v2' },
      { key: 'SMMGEN_API_KEY', label: 'API Key', default: '', isSecret: true, placeholder: 'Enter your SMMGen API Key' }
    ]
  },
  {
    id: 'smmcost',
    name: 'SMMCost',
    category: 'smm',
    icon: Server,
    color: 'from-emerald-600 to-teal-600',
    description: 'SMMCost provider API integration',
    keys: [
      { key: 'SMMCOST_API_URL', label: 'API URL', default: 'https://api.smmcost.com', isSecret: false, placeholder: 'https://api.smmcost.com' },
      { key: 'SMMCOST_API_KEY', label: 'API Key', default: '', isSecret: true, placeholder: 'Enter your SMMCost API Key' }
    ]
  },
  {
    id: 'jbsmmpanel',
    name: 'JB SMM Panel',
    category: 'smm',
    icon: Server,
    color: 'from-purple-600 to-pink-600',
    description: 'JB SMM Panel provider integration',
    keys: [
      { key: 'JBSMMPANEL_API_URL', label: 'API URL', default: 'https://jbsmmpanel.com/api/v2', isSecret: false, placeholder: 'https://jbsmmpanel.com/api/v2' },
      { key: 'JBSMMPANEL_API_KEY', label: 'API Key', default: '', isSecret: true, placeholder: 'Enter your JB SMM API Key' }
    ]
  },
  {
    id: 'worldofsmm',
    name: 'World of SMM',
    category: 'smm',
    icon: Server,
    color: 'from-orange-500 to-amber-600',
    description: 'World of SMM provider API integration',
    keys: [
      { key: 'WORLDOFSMM_API_URL', label: 'API URL', default: 'https://worldofsmm.com/api/v2', isSecret: false, placeholder: 'https://worldofsmm.com/api/v2' },
      { key: 'WORLDOFSMM_API_KEY', label: 'API Key', default: '', isSecret: true, placeholder: 'Enter your World of SMM API Key' }
    ]
  },
  {
    id: 'g1618',
    name: 'G1618 SMM',
    category: 'smm',
    icon: Server,
    color: 'from-cyan-600 to-blue-700',
    description: 'G1618 SMM provider API integration',
    keys: [
      { key: 'G1618_API_URL', label: 'API URL', default: 'https://g1618.com/api/v2', isSecret: false, placeholder: 'https://g1618.com/api/v2' },
      { key: 'G1618_API_KEY', label: 'API Key', default: '', isSecret: true, placeholder: 'Enter your G1618 API Key' }
    ]
  },
  {
    id: 'oldsmm',
    name: 'OldSMM',
    category: 'smm',
    icon: Server,
    color: 'from-violet-600 to-indigo-800',
    description: 'OldSMM provider API integration',
    keys: [
      { key: 'OLDSMM_API_URL', label: 'API URL', default: 'https://oldsmm.com/api/v2', isSecret: false, placeholder: 'https://oldsmm.com/api/v2' },
      { key: 'OLDSMM_API_KEY', label: 'API Key', default: '', isSecret: true, placeholder: 'Enter your OldSMM API Key' }
    ]
  },
  {
    id: 'apiowner',
    name: 'ApiOwner',
    category: 'smm',
    icon: Server,
    color: 'from-rose-600 to-red-700',
    description: 'ApiOwner provider API integration',
    keys: [
      { key: 'APIOWNER_API_URL', label: 'API URL', default: 'https://apiowner.com/api/v2', isSecret: false, placeholder: 'https://apiowner.com/api/v2' },
      { key: 'APIOWNER_API_KEY', label: 'API Key', default: '', isSecret: true, placeholder: 'Enter your ApiOwner API Key' }
    ]
  },

  // Payment Gateways
  {
    id: 'paystack',
    name: 'Paystack',
    category: 'payment',
    icon: CreditCard,
    color: 'from-blue-500 to-blue-700',
    description: 'Paystack payment gateway API & Secret keys',
    keys: [
      { key: 'PAYSTACK_PUBLIC_KEY', label: 'Public Key', default: '', isSecret: false, placeholder: 'pk_live_...' },
      { key: 'PAYSTACK_SECRET_KEY', label: 'Secret Key', default: '', isSecret: true, placeholder: 'sk_live_...' }
    ]
  },
  {
    id: 'korapay',
    name: 'Korapay',
    category: 'payment',
    icon: CreditCard,
    color: 'from-green-600 to-emerald-700',
    description: 'Korapay Nigerian & African payments API credentials',
    keys: [
      { key: 'KORAPAY_PUBLIC_KEY', label: 'Public Key', default: '', isSecret: false, placeholder: 'pk_live_...' },
      { key: 'KORAPAY_SECRET_KEY', label: 'Secret Key', default: '', isSecret: true, placeholder: 'sk_live_...' },
      { key: 'KORAPAY_ENCRYPTION_KEY', label: 'Encryption Key', default: '', isSecret: true, placeholder: 'Encryption key' }
    ]
  },
  {
    id: 'hubtel',
    name: 'Hubtel',
    category: 'payment',
    icon: CreditCard,
    color: 'from-red-500 to-orange-600',
    description: 'Hubtel Ghana Mobile Money & Card payment API credentials',
    keys: [
      { key: 'HUBTEL_CLIENT_ID', label: 'Client ID', default: '', isSecret: true, placeholder: 'Hubtel Client ID' },
      { key: 'HUBTEL_CLIENT_SECRET', label: 'Client Secret', default: '', isSecret: true, placeholder: 'Hubtel Client Secret' },
      { key: 'HUBTEL_MERCHANT_ACCOUNT', label: 'Merchant Account', default: '', isSecret: false, placeholder: '2019...' },
      { key: 'HUBTEL_POS_ID', label: 'POS Channel ID', default: '', isSecret: false, placeholder: 'POS Terminal ID' }
    ]
  },
  {
    id: 'moolre',
    name: 'Moolre & SMS',
    category: 'payment',
    icon: CreditCard,
    color: 'from-purple-600 to-indigo-700',
    description: 'Moolre payment gateway and OTP SMS notifications',
    keys: [
      { key: 'MOOLRE_API_USER', label: 'API Username', default: '', isSecret: false, placeholder: 'Moolre User ID' },
      { key: 'MOOLRE_API_PUBKEY', label: 'API Public Key', default: '', isSecret: true, placeholder: 'Moolre Public Key' },
      { key: 'MOOLRE_ACCOUNT_NUMBER', label: 'Receiving Wallet Account Number', default: '', isSecret: false, placeholder: 'Moolre Account Number' },
      { key: 'MOOLRE_VAS_KEY', label: 'VAS Key (SMS)', default: '', isSecret: true, placeholder: 'X-API-VASKEY for SMS' },
      { key: 'MOOLRE_SENDER_ID', label: 'SMS Sender ID', default: 'Boostupgh', isSecret: false, placeholder: 'Boostupgh' }
    ]
  },

  // Infrastructure & System
  {
    id: 'supabase',
    name: 'Supabase Database',
    category: 'infrastructure',
    icon: Database,
    color: 'from-emerald-700 to-teal-800',
    description: 'Supabase database endpoints, service role keys, and JWT secrets',
    keys: [
      { key: 'SUPABASE_URL', label: 'Project URL', default: '', isSecret: false, placeholder: 'https://xyz.supabase.co' },
      { key: 'SUPABASE_ANON_KEY', label: 'Anon Public Key', default: '', isSecret: true, placeholder: 'eyJhbGciOi...' },
      { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Service Role Key (Admin)', default: '', isSecret: true, placeholder: 'eyJhbGciOi...' },
      { key: 'SUPABASE_JWT_SECRET', label: 'JWT Secret', default: '', isSecret: true, placeholder: 'JWT signing secret' }
    ]
  },
  {
    id: 'redis',
    name: 'Upstash Redis',
    category: 'infrastructure',
    icon: Database,
    color: 'from-red-600 to-pink-700',
    description: 'Upstash Redis REST caching and rate-limiting endpoints',
    keys: [
      { key: 'UPSTASH_REDIS_REST_URL', label: 'REST URL', default: '', isSecret: false, placeholder: 'https://...upstash.io' },
      { key: 'UPSTASH_REDIS_REST_TOKEN', label: 'REST Token', default: '', isSecret: true, placeholder: 'Upstash REST Token' },
      { key: 'REDIS_URL', label: 'Redis URL (Optional)', default: '', isSecret: true, placeholder: 'redis://...' }
    ]
  },
  {
    id: 'security',
    name: 'System & Security Secrets',
    category: 'security',
    icon: ShieldCheck,
    color: 'from-slate-700 to-gray-900',
    description: 'Cron security keys, monitor authentication, and notification emails',
    keys: [
      { key: 'CRON_SECRET', label: 'Cron Secret Header', default: '', isSecret: true, placeholder: 'Bearer secret for scheduled tasks' },
      { key: 'DEV_MONITOR_KEY', label: 'Dev Monitor Key', default: '', isSecret: true, placeholder: 'Access key for dev monitors' },
      { key: 'ADMIN_EMAILS', label: 'Admin Notification Emails', default: '', isSecret: false, placeholder: 'admin1@gmail.com, admin2@gmail.com' },
      { key: 'FRONTEND_URL', label: 'Frontend URL', default: 'https://boostupgh.com', isSecret: false, placeholder: 'https://boostupgh.com' }
    ]
  }
];

const CATEGORIES = [
  { id: 'all', label: 'All Providers', icon: Sliders },
  { id: 'smm', label: 'SMM Providers', icon: Server },
  { id: 'payment', label: 'Payment Gateways', icon: CreditCard },
  { id: 'infrastructure', label: 'Database & Redis', icon: Database },
  { id: 'security', label: 'System & Security', icon: ShieldCheck },
  { id: 'raw', label: 'Raw Key List', icon: Layers },
];

const AdminEnvSettings = memo(() => {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProviderId, setSelectedProviderId] = useState('smmgen');
  const [viewMode, setViewMode] = useState('presets'); // 'presets' | 'raw'
  const [searchQuery, setSearchQuery] = useState('');
  const [revealedKeys, setRevealedKeys] = useState({});
  const [revealingAll, setRevealingAll] = useState(false);
  const [editedValues, setEditedValues] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);
  const [testingTarget, setTestingTarget] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newVarData, setNewVarData] = useState({ key: '', value: '', description: '' });
  const [savingBatch, setSavingBatch] = useState(false);

  // Helper to fetch auth token
  const getAuthToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  }, []);

  // 1. Fetch Environment Variables from Server
  const { data: envData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['admin', 'env-settings', revealingAll],
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const url = revealingAll
        ? '/api/admin/env-settings?action=get_env_vars&revealAll=true'
        : '/api/admin/env-settings?action=get_env_vars';

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch environment variables');
      }

      return await res.json();
    },
    staleTime: 60 * 1000,
  });

  const variables = envData?.variables || [];

  // Map variables by key for fast lookup
  const variableMap = useMemo(() => {
    const map = new Map();
    variables.forEach(v => {
      map.set(v.key, v);
      map.set(v.key.toUpperCase(), v);
    });
    return map;
  }, [variables]);

  // 2. Fetch Single Value Reveal
  const handleToggleRevealSingle = async (key) => {
    if (revealedKeys[key]) {
      setRevealedKeys(prev => ({ ...prev, [key]: null }));
      return;
    }

    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/env-settings?action=get_value&key=${encodeURIComponent(key)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setRevealedKeys(prev => ({ ...prev, [key]: data.value }));
      } else {
        toast.error(data.error || 'Failed to reveal value');
      }
    } catch (err) {
      toast.error('Error revealing value: ' + err.message);
    }
  };

  // 3. Save Multiple Provider Keys Mutation
  const saveBatchMutation = useMutation({
    mutationFn: async (variablesToSave) => {
      setSavingBatch(true);
      const token = await getAuthToken();
      const res = await fetch('/api/admin/env-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'save_batch',
          variables: variablesToSave
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save settings');
      }
      return data;
    },
    onSuccess: (_, variablesToSave) => {
      toast.success(`Successfully saved settings!`);
      // Clear edited state for saved keys
      setEditedValues(prev => {
        const next = { ...prev };
        variablesToSave.forEach(v => delete next[v.key]);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'env-settings'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Error saving settings');
    },
    onSettled: () => {
      setSavingBatch(false);
    }
  });

  // 4. Delete Variable Override Mutation
  const deleteMutation = useMutation({
    mutationFn: async (key) => {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/env-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'delete_env_var',
          key
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete override');
      }
      return key;
    },
    onSuccess: (key) => {
      toast.success(`Reset ${key} to system environment/default`);
      setEditedValues(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'env-settings'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Error resetting variable');
    }
  });

  // 5. Test Connection Handler
  const handleTestConnection = async (targetId) => {
    setTestingTarget(targetId);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/env-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'test_connection',
          target: targetId
        })
      });
      const data = await res.json();
      setTestResults(prev => ({
        ...prev,
        [targetId]: {
          success: data.success,
          message: data.message || data.error,
          latencyMs: data.latencyMs,
          time: new Date().toLocaleTimeString()
        }
      }));

      if (data.success) {
        toast.success(`${targetId.toUpperCase()}: ${data.message}`);
      } else {
        toast.error(`${targetId.toUpperCase()}: ${data.message || data.error}`);
      }
    } catch (err) {
      toast.error(`Test failed: ${err.message}`);
      setTestResults(prev => ({
        ...prev,
        [targetId]: {
          success: false,
          message: err.message,
          time: new Date().toLocaleTimeString()
        }
      }));
    } finally {
      setTestingTarget(null);
    }
  };

  // Copy to clipboard
  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`Copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Add Custom Variable Submit
  const handleCreateCustomVar = (e) => {
    e.preventDefault();
    if (!newVarData.key.trim()) {
      toast.error('Key is required');
      return;
    }
    const cleanKey = newVarData.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    saveBatchMutation.mutate([{
      key: cleanKey,
      value: newVarData.value.trim(),
      description: newVarData.description.trim()
    }], {
      onSuccess: () => {
        setAddModalOpen(false);
        setNewVarData({ key: '', value: '', description: '' });
      }
    });
  };

  // Currently selected provider object
  const activeProvider = useMemo(() => {
    return PROVIDER_PRESETS.find(p => p.id === selectedProviderId) || PROVIDER_PRESETS[0];
  }, [selectedProviderId]);

  // Check if current active provider has unsaved changes
  const hasActiveProviderChanges = useMemo(() => {
    if (!activeProvider) return false;
    return activeProvider.keys.some(k => editedValues[k.key] !== undefined);
  }, [activeProvider, editedValues]);

  // Save all keys for active provider
  const handleSaveActiveProviderKeys = () => {
    if (!activeProvider) return;
    const batch = activeProvider.keys.map(k => {
      const liveItem = variableMap.get(k.key);
      const val = editedValues[k.key] !== undefined
        ? editedValues[k.key]
        : (revealedKeys[k.key] !== undefined && revealedKeys[k.key] !== null
          ? revealedKeys[k.key]
          : (liveItem ? liveItem.value : k.default));

      return {
        key: k.key,
        value: val || '',
        description: liveItem?.description || activeProvider.description
      };
    });

    saveBatchMutation.mutate(batch);
  };

  // Filtered providers for selector
  const filteredProviders = useMemo(() => {
    return PROVIDER_PRESETS.filter(p => {
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.keys.some(k => k.key.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [selectedCategory, searchQuery]);

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300 p-2 sm:p-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Skeleton className="h-8 w-48 sm:w-64" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-96 lg:col-span-2 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-16 px-1 sm:px-0">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b pb-4 sm:pb-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 via-indigo-800 to-indigo-600 bg-clip-text text-transparent">
              Provider Keys & Config
            </h2>
            <Badge variant="outline" className="text-[10px] sm:text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
              Live Runtime
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Select a provider to view, test, and save its API keys directly without redeploying.
          </p>
        </div>

        {/* Action Bar (Optimized for Mobile Touch) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 p-1 rounded-lg border w-full sm:w-auto">
            <button
              onClick={() => setViewMode('presets')}
              className={`flex-1 sm:flex-none text-center px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'presets' ? 'bg-white text-indigo-700 shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Provider View
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`flex-1 sm:flex-none text-center px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'raw' ? 'bg-white text-indigo-700 shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
            >
              All Raw Keys ({variables.length})
            </button>
          </div>

          <div className="grid grid-cols-3 sm:flex items-center gap-2 w-full sm:w-auto">
            {/* Reveal Secrets Button */}
            <Button
              variant={revealingAll ? "default" : "outline"}
              size="sm"
              onClick={() => setRevealingAll(!revealingAll)}
              className="gap-1 text-[11px] sm:text-xs h-10 sm:h-9 w-full sm:w-auto px-2 sm:px-3"
            >
              {revealingAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="truncate">{revealingAll ? 'Mask' : 'Reveal'}</span>
            </Button>

            {/* Add Custom Variable Button */}
            <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] sm:text-xs h-10 sm:h-9 w-full sm:w-auto px-2 sm:px-3">
                  <Plus className="w-3.5 h-3.5" />
                  <span className="truncate">Add Key</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] sm:max-w-[480px] p-5 sm:p-6 rounded-2xl">
                <form onSubmit={handleCreateCustomVar}>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Key className="w-5 h-5 text-indigo-600" />
                      Add Custom Variable
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      Create a custom application configuration override in the database.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3.5 py-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-key" className="text-xs font-semibold">Key Identifier</Label>
                      <Input
                        id="new-key"
                        placeholder="e.g. CUSTOM_WEBHOOK_URL"
                        value={newVarData.key}
                        onChange={(e) => setNewVarData({ ...newVarData, key: e.target.value })}
                        className="font-mono text-xs uppercase h-10"
                        required
                      />
                      <p className="text-[11px] text-muted-foreground">Will be auto-formatted to UPPER_SNAKE_CASE.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-val" className="text-xs font-semibold">Value</Label>
                      <Input
                        id="new-val"
                        placeholder="Enter value"
                        value={newVarData.value}
                        onChange={(e) => setNewVarData({ ...newVarData, value: e.target.value })}
                        className="h-10 text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-desc" className="text-xs font-semibold">Description (Optional)</Label>
                      <Input
                        id="new-desc"
                        placeholder="Purpose or notes"
                        value={newVarData.description}
                        onChange={(e) => setNewVarData({ ...newVarData, description: e.target.value })}
                        className="h-10 text-xs"
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)} className="h-10 sm:h-9">
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 h-10 sm:h-9" disabled={saveBatchMutation.isPending}>
                      {saveBatchMutation.isPending ? 'Saving...' : 'Create Variable'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Refresh Button */}
            <Button
              onClick={() => refetch()}
              disabled={isRefetching}
              variant="outline"
              size="sm"
              className="gap-1 text-[11px] sm:text-xs h-10 sm:h-9 w-full sm:w-auto px-2 sm:px-3"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
              <span className="truncate">Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'presets' ? (
        <div className="space-y-4">
          {/* MOBILE QUICK SELECTOR (Shown on mobile & tablets < lg) */}
          <div className="block lg:hidden space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="mobile-provider-select" className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                Select Provider
              </Label>
              <span className="text-[11px] text-muted-foreground">{PROVIDER_PRESETS.length} available</span>
            </div>

            {/* Mobile Dropdown Picker */}
            <div className="relative">
              <select
                id="mobile-provider-select"
                value={selectedProviderId}
                onChange={(e) => setSelectedProviderId(e.target.value)}
                className="w-full h-12 pl-3.5 pr-10 bg-white border-2 border-indigo-200 focus:border-indigo-600 rounded-xl text-sm font-semibold text-gray-900 appearance-none shadow-xs"
              >
                <optgroup label="SMM Providers">
                  {PROVIDER_PRESETS.filter(p => p.category === 'smm').map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {testResults[p.id]?.success ? '✓' : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Payment Gateways">
                  {PROVIDER_PRESETS.filter(p => p.category === 'payment').map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {testResults[p.id]?.success ? '✓' : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Database & Security">
                  {PROVIDER_PRESETS.filter(p => p.category === 'infrastructure' || p.category === 'security').map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {testResults[p.id]?.success ? '✓' : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown className="w-5 h-5 text-indigo-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Mobile Horizontal Quick-Scroll Chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1">
              {PROVIDER_PRESETS.map(p => {
                const isSelected = selectedProviderId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProviderId(p.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isSelected
                      ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* DESKTOP + TABLET GRID LAYOUT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Desktop Provider List (4 cols) */}
            <div className="hidden lg:block lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  Select Provider
                </h3>
                <span className="text-xs text-muted-foreground">{filteredProviders.length} available</span>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-1 bg-gray-100/90 p-1 rounded-lg border">
                {CATEGORIES.filter(c => c.id !== 'raw').map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${selectedCategory === cat.id ? 'bg-white text-indigo-700 shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Provider Cards List */}
              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {filteredProviders.map(p => {
                  const isSelected = selectedProviderId === p.id;
                  const Icon = p.icon;
                  const testResult = testResults[p.id];
                  const isConfigured = p.keys.every(k => {
                    const live = variableMap.get(k.key);
                    return live && live.isConfigured;
                  });
                  const isOverridden = p.keys.some(k => {
                    const live = variableMap.get(k.key);
                    return live && live.isOverridden;
                  });

                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProviderId(p.id)}
                      className={`cursor-pointer p-3.5 rounded-xl border-2 transition-all flex items-center justify-between gap-3 ${isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500'
                        : 'border-gray-200 hover:border-indigo-300 bg-white hover:bg-gray-50/50'
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${p.color} text-white shadow-xs flex-shrink-0`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                            {isOverridden && (
                              <Badge className="bg-indigo-100 text-indigo-800 text-[10px] px-1 py-0 border-indigo-200">
                                DB
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{p.keys.length} keys &bull; {isConfigured ? 'Configured' : 'Needs Setup'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {testResult && (
                          <span className={`w-2 h-2 rounded-full ${testResult.success ? 'bg-emerald-500' : 'bg-red-500'}`} title={testResult.message} />
                        )}
                        <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-indigo-600 translate-x-0.5' : 'text-gray-400'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Selected Provider Key Editor & Diagnostics (8 cols) */}
            <div className="lg:col-span-8 w-full">
              {activeProvider && (
                <Card className="border-2 border-indigo-100 shadow-md bg-white rounded-2xl overflow-hidden">
                  {/* Provider Card Header */}
                  <CardHeader className="border-b bg-gradient-to-r from-indigo-50/50 via-white to-blue-50/40 p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${activeProvider.color} text-white shadow-sm flex-shrink-0`}>
                          <activeProvider.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <CardTitle className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                              {activeProvider.name}
                            </CardTitle>
                            <Badge variant="outline" className="text-[10px] sm:text-xs font-mono uppercase bg-white">
                              {activeProvider.id}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs mt-0.5 line-clamp-2">
                            {activeProvider.description}
                          </CardDescription>
                        </div>
                      </div>

                      {/* Test Connection Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(activeProvider.id)}
                        disabled={testingTarget === activeProvider.id}
                        className="gap-1.5 text-xs h-10 sm:h-9 border-indigo-200 text-indigo-700 hover:bg-indigo-50 w-full sm:w-auto justify-center"
                      >
                        {testingTarget === activeProvider.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 text-indigo-600" />
                        )}
                        Test Connection
                      </Button>
                    </div>

                    {/* Live Diagnostic Message Banner */}
                    {testResults[activeProvider.id] && (
                      <div className={`mt-3 p-2.5 sm:p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${testResults[activeProvider.id].success
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-red-50 text-red-800 border-red-200'
                        }`}>
                        <div className="flex items-center gap-2 min-w-0">
                          {testResults[activeProvider.id].success ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                          )}
                          <span className="font-medium truncate">{testResults[activeProvider.id].message}</span>
                        </div>
                        {testResults[activeProvider.id].latencyMs && (
                          <Badge variant="outline" className="font-mono text-[10px] bg-white flex-shrink-0">
                            {testResults[activeProvider.id].latencyMs}ms
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardHeader>

                  {/* Form Fields for Active Provider */}
                  <CardContent className="p-3.5 sm:p-6 space-y-4 sm:space-y-5">
                    {activeProvider.keys.map((k) => {
                      const keyName = k.key;
                      const liveItem = variableMap.get(keyName);
                      const isSecret = k.isSecret;
                      const hasLocalEdit = editedValues[keyName] !== undefined;

                      // Compute display value
                      const isManuallyRevealed = revealedKeys[keyName] !== undefined && revealedKeys[keyName] !== null;
                      const revealedValue = isManuallyRevealed ? revealedKeys[keyName] : (revealingAll ? liveItem?.rawValue : null);

                      const currentVal = hasLocalEdit
                        ? editedValues[keyName]
                        : (revealedValue !== null && revealedValue !== undefined
                          ? revealedValue
                          : (liveItem ? liveItem.value : k.default));

                      return (
                        <div key={keyName} className="space-y-2 p-3 sm:p-4 bg-gray-50/70 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              <Label htmlFor={keyName} className="text-xs font-bold text-gray-800 flex items-center gap-1">
                                {isSecret && <Lock className="w-3 h-3 text-amber-600 inline flex-shrink-0" />}
                                <span>{k.label}</span>
                              </Label>
                              <span className="font-mono text-[10px] sm:text-[11px] text-muted-foreground truncate">({keyName})</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {liveItem?.source === 'database' && (
                                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[9px] sm:text-[10px] px-1.5 py-0">
                                  DB Override
                                </Badge>
                              )}
                              {liveItem?.source === 'env' && (
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] sm:text-[10px] px-1.5 py-0">
                                  System Env
                                </Badge>
                              )}
                              {liveItem?.source === 'default' && (
                                <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1.5 py-0">
                                  Default
                                </Badge>
                              )}

                              {/* Reset override button */}
                              {liveItem?.isOverridden && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (window.confirm(`Reset ${keyName} to system default?`)) {
                                      deleteMutation.mutate(keyName);
                                    }
                                  }}
                                  className="h-6 px-1.5 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Remove database override"
                                >
                                  <Undo2 className="w-3 h-3 mr-0.5" />
                                  Reset
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Input & Action buttons */}
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <div className="relative flex-1">
                              <Input
                                id={keyName}
                                type={isSecret && !revealingAll && !isManuallyRevealed && !hasLocalEdit ? "password" : "text"}
                                value={currentVal || ''}
                                onChange={(e) => {
                                  setEditedValues(prev => ({
                                    ...prev,
                                    [keyName]: e.target.value
                                  }));
                                }}
                                placeholder={k.placeholder || k.default || 'Enter value'}
                                className={`font-mono text-xs h-11 sm:h-10 pr-9 ${hasLocalEdit ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-300' : 'bg-white'}`}
                              />

                              {isSecret && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleRevealSingle(keyName)}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1 focus:outline-none"
                                  title={isManuallyRevealed ? "Hide secret" : "Reveal secret"}
                                >
                                  {isManuallyRevealed ? (
                                    <EyeOff className="w-4 h-4" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </div>

                            <Button
                              variant="outline"
                              size="icon"
                              className="h-11 sm:h-10 w-11 sm:w-10 flex-shrink-0 text-gray-500 hover:text-gray-800"
                              onClick={() => handleCopy(revealedValue || liveItem?.rawValue || currentVal, keyName)}
                              title="Copy Value"
                            >
                              {copiedKey === keyName ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>

                  {/* Footer with One-Click Save All Keys for Provider */}
                  <CardFooter className="border-t bg-gray-50/80 p-3.5 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground text-center sm:text-left">
                      {hasActiveProviderChanges ? (
                        <span className="text-amber-600 font-semibold flex items-center justify-center sm:justify-start gap-1">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          Unsaved key changes pending
                        </span>
                      ) : (
                        <span>All credentials saved in database</span>
                      )}
                    </div>

                    <Button
                      onClick={handleSaveActiveProviderKeys}
                      disabled={savingBatch || saveBatchMutation.isPending}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs font-semibold h-11 sm:h-9 w-full sm:w-auto shadow-xs"
                    >
                      <Save className="w-4 h-4" />
                      {savingBatch ? 'Saving Keys...' : `Save ${activeProvider.name} Keys`}
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Raw Key-Value Variables View */
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search raw variables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-10 sm:h-9 bg-white"
              />
            </div>
          </div>

          <div className="space-y-3">
            {variables
              .filter(v => {
                const q = searchQuery.toLowerCase().trim();
                return !q || v.key.toLowerCase().includes(q) || (v.description && v.description.toLowerCase().includes(q));
              })
              .map(item => {
                const key = item.key;
                const hasLocalEdit = editedValues[key] !== undefined;
                const isSecret = item.isSecret;
                const isManuallyRevealed = revealedKeys[key] !== undefined && revealedKeys[key] !== null;
                const revealedValue = isManuallyRevealed ? revealedKeys[key] : (revealingAll ? item.rawValue : null);
                const displayVal = hasLocalEdit ? editedValues[key] : (revealedValue !== null && revealedValue !== undefined ? revealedValue : item.value);

                return (
                  <Card key={key} className="border bg-white shadow-2xs hover:border-gray-300 transition-colors">
                    <CardContent className="p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-gray-900 flex items-center gap-1 truncate">
                            {isSecret && <Lock className="w-3 h-3 text-amber-600 inline flex-shrink-0" />}
                            {item.key}
                          </span>
                          <Badge variant="outline" className="text-[9px] sm:text-[10px]">
                            {item.source}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{item.description}</p>
                      </div>

                      <div className="flex items-center gap-2 md:max-w-md w-full">
                        <div className="relative flex-1">
                          <Input
                            type={isSecret && !revealingAll && !isManuallyRevealed && !hasLocalEdit ? "password" : "text"}
                            value={displayVal || ''}
                            onChange={(e) => setEditedValues(prev => ({ ...prev, [key]: e.target.value }))}
                            className="font-mono text-xs h-10 sm:h-9 pr-8 bg-gray-50"
                          />
                          {isSecret && (
                            <button
                              type="button"
                              onClick={() => handleToggleRevealSingle(key)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1"
                            >
                              {isManuallyRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>

                        {hasLocalEdit && (
                          <Button
                            size="sm"
                            onClick={() => saveBatchMutation.mutate([{ key, value: editedValues[key], description: item.description }])}
                            className="h-10 sm:h-9 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                        )}

                        {item.isOverridden && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (window.confirm(`Reset ${key}?`)) deleteMutation.mutate(key);
                            }}
                            className="h-10 sm:h-9 px-2 text-xs text-red-600 border-red-200"
                            title="Reset override"
                          >
                            <Undo2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
});

export default AdminEnvSettings;
