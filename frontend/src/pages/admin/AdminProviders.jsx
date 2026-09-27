import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Loader2,
    RefreshCw,
    Plus,
    Server,
    CheckCircle2,
    AlertCircle,
    Trash2,
    Edit,
    ExternalLink,
    Key,
    Activity,
    Eye,
    EyeOff,
    Check,
    Globe
} from "lucide-react";
import { toast } from "sonner";
import {
    getDynamicProviders,
    createDynamicProvider,
    updateDynamicProvider,
    deleteDynamicProvider,
    testDynamicProviderConnection
} from '../../lib/dynamicProviders';

export default function AdminProviders() {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
    const [currentProviderId, setCurrentProviderId] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        api_url: '',
        api_key: '',
        priority: 100,
        status: 'active'
    });
    const [showKey, setShowKey] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // In-modal test connection state
    const [modalTesting, setModalTesting] = useState(false);
    const [modalTestResult, setModalTestResult] = useState(null);

    // Card-level test connection state
    const [cardTestingId, setCardTestingId] = useState(null);

    // Delete confirmation dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [providerToDelete, setProviderToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Fetch providers
    const loadProviders = useCallback(async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true);
            else setLoading(true);

            const list = await getDynamicProviders();
            setProviders(list || []);
        } catch (error) {
            console.error('Failed to load dynamic providers:', error);
            toast.error(error.message || 'Failed to load dynamic providers');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadProviders();
    }, [loadProviders]);

    // Open Create Modal
    const handleOpenCreate = () => {
        setModalMode('create');
        setCurrentProviderId(null);
        setFormData({
            name: '',
            api_url: '',
            api_key: '',
            priority: 100,
            status: 'active'
        });
        setShowKey(false);
        setModalTestResult(null);
        setIsModalOpen(true);
    };

    // Open Edit Modal
    const handleOpenEdit = (p) => {
        setModalMode('edit');
        setCurrentProviderId(p.id);
        setFormData({
            name: p.name || '',
            api_url: p.api_url || '',
            api_key: p.api_key || '',
            priority: p.priority ?? 100,
            status: p.status || 'active'
        });
        setShowKey(false);
        setModalTestResult(null);
        setIsModalOpen(true);
    };

    // Test credentials inside modal
    const handleModalTest = async () => {
        if (!formData.api_url || !formData.api_url.trim()) {
            toast.error('Please enter an API URL first');
            return;
        }
        if (!formData.api_key || !formData.api_key.trim()) {
            toast.error('Please enter an API Key first');
            return;
        }

        try {
            setModalTesting(true);
            setModalTestResult(null);
            const res = await testDynamicProviderConnection({
                api_url: formData.api_url.trim(),
                api_key: formData.api_key.trim()
            });

            setModalTestResult({
                success: true,
                balance: res.balance,
                currency: res.currency || 'USD'
            });
            toast.success(`Connected! Balance: $${Number(res.balance).toFixed(2)} ${res.currency || 'USD'}`);
        } catch (error) {
            console.error('Test failed:', error);
            setModalTestResult({
                success: false,
                error: error.message || 'Failed to connect to provider'
            });
            toast.error(error.message || 'Failed to connect');
        } finally {
            setModalTesting(false);
        }
    };

    // Save Provider (Create or Update)
    const handleSaveProvider = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            toast.error('Provider name is required');
            return;
        }
        if (!formData.api_url.trim()) {
            toast.error('API URL is required');
            return;
        }
        if (!formData.api_key.trim()) {
            toast.error('API Key is required');
            return;
        }

        try {
            setSubmitting(true);
            if (modalMode === 'create') {
                const res = await createDynamicProvider(formData);
                toast.success(`Provider "${res.provider?.name || formData.name}" created successfully!`);
            } else {
                await updateDynamicProvider(currentProviderId, formData);
                toast.success(`Provider updated successfully!`);
            }
            setIsModalOpen(false);
            loadProviders(true);
        } catch (error) {
            console.error('Failed to save provider:', error);
            toast.error(error.message || 'Failed to save provider');
        } finally {
            setSubmitting(false);
        }
    };

    // Quick status toggle
    const handleToggleStatus = async (provider) => {
        const nextStatus = provider.status === 'active' ? 'disabled' : 'active';
        try {
            await updateDynamicProvider(provider.id, { status: nextStatus });
            setProviders(prev => prev.map(p => p.id === provider.id ? { ...p, status: nextStatus } : p));
            toast.success(`Provider ${provider.name} set to ${nextStatus}`);
        } catch (error) {
            console.error('Failed to toggle status:', error);
            toast.error(error.message || 'Failed to update status');
        }
    };

    // Live test connection directly from card
    const handleCardTest = async (provider) => {
        try {
            setCardTestingId(provider.id);
            const res = await testDynamicProviderConnection({
                api_url: provider.api_url,
                api_key: provider.api_key
            });
            toast.success(`${provider.name} Connected! Live Balance: $${Number(res.balance).toFixed(2)} ${res.currency || 'USD'}`);
            loadProviders(true);
        } catch (error) {
            console.error('Connection test failed:', error);
            toast.error(`${provider.name}: ${error.message || 'Connection test failed'}`);
        } finally {
            setCardTestingId(null);
        }
    };

    // Confirm Delete Dialog
    const handleOpenDelete = (provider) => {
        setProviderToDelete(provider);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!providerToDelete) return;
        try {
            setDeleting(true);
            await deleteDynamicProvider(providerToDelete.id);
            toast.success(`Provider "${providerToDelete.name}" deleted.`);
            setDeleteDialogOpen(false);
            setProviderToDelete(null);
            loadProviders(true);
        } catch (error) {
            console.error('Failed to delete provider:', error);
            toast.error(error.message || 'Failed to delete provider');
        } finally {
            setDeleting(false);
        }
    };

    // Calculated totals
    const activeProvidersCount = providers.filter(p => p.status === 'active').length;
    const totalBalance = providers.reduce((acc, p) => acc + (parseFloat(p.balance) || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl border border-indigo-900/40 text-white shadow-xl">
                <div>
                    <div className="flex items-center gap-2">
                        <Server className="w-6 h-6 text-indigo-400" />
                        <h1 className="text-2xl font-bold tracking-tight">Custom SMM Providers</h1>
                        <Badge variant="outline" className="text-xs bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                            Dynamic SMM v2
                        </Badge>
                    </div>
                    <p className="text-sm text-slate-300 mt-1">
                        Connect, test, and manage any standard SMM panel without code changes or schema migrations.
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadProviders(true)}
                        disabled={refreshing}
                        className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button
                        onClick={handleOpenCreate}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Provider
                    </Button>
                </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-border/60 bg-card/60 backdrop-blur">
                    <CardHeader className="pb-2">
                        <CardDescription>Configured Panels</CardDescription>
                        <CardTitle className="text-2xl font-bold flex items-center justify-between">
                            <span>{providers.length}</span>
                            <Server className="w-5 h-5 text-muted-foreground" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                            {activeProvidersCount} Active & Routing Orders
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/60 backdrop-blur">
                    <CardHeader className="pb-2">
                        <CardDescription>Total Dynamic Balance</CardDescription>
                        <CardTitle className="text-2xl font-bold flex items-center justify-between text-emerald-500">
                            <span>${totalBalance.toFixed(2)} USD</span>
                            <Activity className="w-5 h-5 text-emerald-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            Aggregated live across connected custom providers
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/60 backdrop-blur">
                    <CardHeader className="pb-2">
                        <CardDescription>Protocol Standard</CardDescription>
                        <CardTitle className="text-2xl font-bold flex items-center justify-between text-indigo-400">
                            <span>Standard v2</span>
                            <Globe className="w-5 h-5 text-indigo-400" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            Supports add, status, balance, and services endpoints
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Providers List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center p-16 space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                    <p className="text-sm text-muted-foreground">Loading custom providers...</p>
                </div>
            ) : providers.length === 0 ? (
                <Card className="border-dashed border-2 text-center p-12">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
                        <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-2">
                            <Server className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-semibold">No Custom Providers Added Yet</h3>
                        <p className="text-sm text-muted-foreground">
                            You currently have the 11 built-in providers. You can add any new external SMM provider by entering its API URL and API Key.
                        </p>
                        <Button onClick={handleOpenCreate} className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Your First Custom Provider
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {providers.map((p) => {
                        const isTesting = cardTestingId === p.id;
                        const balanceNum = parseFloat(p.balance);
                        const hasValidBalance = !isNaN(balanceNum) && p.balance !== null;
                        const isLow = hasValidBalance && balanceNum < 5.0;

                        return (
                            <Card key={p.id} className={`border transition-all shadow-sm hover:shadow-md ${p.status === 'disabled' ? 'opacity-65 bg-muted/20' : 'bg-card'}`}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <CardTitle className="text-lg font-bold">{p.name}</CardTitle>
                                                <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
                                                    slug: {p.slug}
                                                </Badge>
                                                <Badge
                                                    className={`text-xs ${p.status === 'active' ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : 'bg-zinc-500/15 text-zinc-500'}`}
                                                    variant="outline"
                                                >
                                                    {p.status === 'active' ? 'Active' : 'Disabled'}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground truncate max-w-sm">
                                                <Globe className="w-3.5 h-3.5 shrink-0" />
                                                <span className="truncate">{p.api_url}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="text-xs font-mono">
                                                Priority: {p.priority}
                                            </Badge>
                                            <Switch
                                                checked={p.status === 'active'}
                                                onCheckedChange={() => handleToggleStatus(p)}
                                                aria-label="Toggle active status"
                                            />
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-4">
                                    {/* Balance and Diagnostics */}
                                    <div className="bg-muted/40 p-3 rounded-xl flex items-center justify-between border border-border/40">
                                        <div>
                                            <span className="text-xs text-muted-foreground block font-medium">Live Balance</span>
                                            <span className={`text-xl font-bold ${isLow ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                {hasValidBalance ? `$${balanceNum.toFixed(2)} ${p.currency || 'USD'}` : '—'}
                                            </span>
                                            {isLow && (
                                                <span className="text-xs text-amber-500 ml-2 font-medium">Low Balance</span>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-muted-foreground block">Last Check</span>
                                            <span className="text-xs text-muted-foreground font-mono">
                                                {p.last_balance_check ? new Date(p.last_balance_check).toLocaleTimeString() : 'Never'}
                                            </span>
                                        </div>
                                    </div>

                                    {p.last_error && (
                                        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
                                            <AlertCircle className="w-4 h-4 shrink-0" />
                                            <span className="truncate">{p.last_error}</span>
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex items-center justify-between pt-1">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleCardTest(p)}
                                                disabled={isTesting}
                                                className="text-xs h-8"
                                            >
                                                {isTesting ? (
                                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                ) : (
                                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                                                )}
                                                Test Connection
                                            </Button>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleOpenEdit(p)}
                                                className="h-8 px-2.5 text-xs"
                                            >
                                                <Edit className="w-3.5 h-3.5 mr-1" />
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleOpenDelete(p)}
                                                className="h-8 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                                Delete
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Add / Edit Modal Dialog */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Server className="w-5 h-5 text-indigo-500" />
                            {modalMode === 'create' ? 'Add New SMM Provider' : 'Edit SMM Provider'}
                        </DialogTitle>
                        <DialogDescription>
                            Configure standard SMM v2 API credentials. New providers will be available in service mappings.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveProvider} className="space-y-4 py-2">
                        {/* Provider Name */}
                        <div className="space-y-1.5">
                            <Label htmlFor="provider-name">Provider Name *</Label>
                            <Input
                                id="provider-name"
                                placeholder="e.g. Peakerr or SMMFlare"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                required
                            />
                        </div>

                        {/* API URL */}
                        <div className="space-y-1.5">
                            <Label htmlFor="provider-url">API URL *</Label>
                            <Input
                                id="provider-url"
                                placeholder="https://paneldomain.com/api/v2"
                                value={formData.api_url}
                                onChange={(e) => {
                                    setFormData(prev => ({ ...prev, api_url: e.target.value }));
                                    setModalTestResult(null);
                                }}
                                required
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Must be the base endpoint supporting POST requests with action=balance, action=add, etc.
                            </p>
                        </div>

                        {/* API Key */}
                        <div className="space-y-1.5">
                            <Label htmlFor="provider-key">API Key *</Label>
                            <div className="relative">
                                <Input
                                    id="provider-key"
                                    type={showKey ? 'text' : 'password'}
                                    placeholder="Enter provider API key"
                                    value={formData.api_key}
                                    onChange={(e) => {
                                        setFormData(prev => ({ ...prev, api_key: e.target.value }));
                                        setModalTestResult(null);
                                    }}
                                    className="pr-10"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Priority and Status */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="provider-priority">Priority</Label>
                                <Input
                                    id="provider-priority"
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={formData.priority}
                                    onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value, 10) || 100 }))}
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Lower = higher order precedence (1-99 beats built-ins).
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <div className="flex items-center gap-2 pt-2">
                                    <Switch
                                        checked={formData.status === 'active'}
                                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, status: checked ? 'active' : 'disabled' }))}
                                    />
                                    <span className="text-xs font-medium">
                                        {formData.status === 'active' ? 'Active' : 'Disabled'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Live Test Connection Box in Modal */}
                        <div className="pt-2 border-t border-border/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-muted-foreground">Verification</span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={handleModalTest}
                                    disabled={modalTesting || !formData.api_url || !formData.api_key}
                                    className="h-7 text-xs"
                                >
                                    {modalTesting ? (
                                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                    ) : (
                                        <CheckCircle2 className="w-3 h-3 mr-1.5 text-indigo-500" />
                                    )}
                                    Test Connection
                                </Button>
                            </div>

                            {modalTestResult && (
                                <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${modalTestResult.success ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30' : 'bg-destructive/15 text-destructive border border-destructive/30'}`}>
                                    {modalTestResult.success ? (
                                        <>
                                            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                                            <span>
                                                Connection Successful! Live balance: <strong>${Number(modalTestResult.balance).toFixed(2)} {modalTestResult.currency}</strong>
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
                                            <span className="truncate">{modalTestResult.error}</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsModalOpen(false)}
                                disabled={submitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={submitting}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Saving...
                                    </>
                                ) : modalMode === 'create' ? 'Add Provider' : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-destructive flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            Delete SMM Provider
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{providerToDelete?.name}</strong>?
                            Any services or packages mapped to this provider will no longer dispatch to it.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmDelete}
                            disabled={deleting}
                        >
                            {deleting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                'Yes, Delete Provider'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
