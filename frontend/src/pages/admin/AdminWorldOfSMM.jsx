import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    RefreshCw,
    CheckCircle,
    XCircle,
    AlertCircle,
    Settings,
    Download,
    Loader2,
    Server,
    Key,
    Globe
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWorldOfSMMServices, getWorldOfSMMBalance } from '@/lib/worldofsmm';
import { supabase } from '@/lib/supabase';

const AdminWorldOfSMM = () => {
    const [apiUrl, setApiUrl] = useState('https://worldofsmm.com/api/v2');
    const [apiKey, setApiKey] = useState('');
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState(null); // 'success', 'error', null
    const [connectionMessage, setConnectionMessage] = useState('');
    const [syncingServices, setSyncingServices] = useState(false);
    const [availableServices, setAvailableServices] = useState([]);
    const [selectedServices, setSelectedServices] = useState(new Set());
    const [importingServices, setImportingServices] = useState(false);
    const [balance, setBalance] = useState(null);
    const [loadingBalance, setLoadingBalance] = useState(false);
    const [syncLogs, setSyncLogs] = useState([]);

    // Load saved API configuration from localStorage
    React.useEffect(() => {
        const savedApiUrl = localStorage.getItem('worldofsmm_api_url');
        const savedApiKey = localStorage.getItem('worldofsmm_api_key');
        if (savedApiUrl) setApiUrl(savedApiUrl);
        if (savedApiKey) setApiKey(savedApiKey);
    }, []);

    // Save API configuration to localStorage
    const saveConfig = useCallback(() => {
        localStorage.setItem('worldofsmm_api_url', apiUrl);
        localStorage.setItem('worldofsmm_api_key', apiKey);
        toast.success('API configuration saved');
    }, [apiUrl, apiKey]);

    const addLog = (message) => {
        setSyncLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            message
        }]);
    };

    // Test API connection
    const testConnection = useCallback(async () => {
        setTestingConnection(true);
        setConnectionStatus(null);
        setConnectionMessage('');

        try {
            const response = await fetch('/api/worldofsmm/balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                setConnectionStatus('success');
                setConnectionMessage('Successfully connected to World of SMM API');
                toast.success('Connection test successful');
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Connection test failed' }));
                setConnectionStatus('error');
                setConnectionMessage(errorData.error || 'Connection test failed');
                toast.error(`Connection test failed: ${errorData.error || 'Unknown error'}`);
            }
        } catch (error) {
            setConnectionStatus('error');
            setConnectionMessage(error.message);
            toast.error(`Connection test failed: ${error.message}`);
        } finally {
            setTestingConnection(false);
        }
    }, [apiUrl, apiKey]);

    // Fetch available services
    const syncServices = useCallback(async () => {
        setSyncingServices(true);
        setSyncLogs([]);
        addLog('Starting service sync...');

        try {
            const services = await fetchWorldOfSMMServices();

            if (Array.isArray(services) && services.length > 0) {
                setAvailableServices(services);
                addLog(`Successfully fetched ${services.length} services from World of SMM`);
                toast.success(`Fetched ${services.length} services`);
            } else {
                addLog('No services found or invalid response format');
                toast.warning('No services found');
            }
        } catch (error) {
            addLog(`Error fetching services: ${error.message}`);
            toast.error(`Failed to fetch services: ${error.message}`);
        } finally {
            setSyncingServices(false);
        }
    }, []);

    // Fetch account balance
    const fetchBalance = useCallback(async () => {
        setLoadingBalance(true);
        try {
            const balanceData = await getWorldOfSMMBalance();
            const balanceValue = balanceData?.balance || balanceData?.balance_amount || null;

            if (balanceValue !== null) {
                setBalance(parseFloat(balanceValue));
                toast.success('Balance fetched successfully');
            } else {
                setBalance(null);
                toast.warning('Could not retrieve balance information');
            }
        } catch (error) {
            setBalance(null);
            toast.error(`Failed to fetch balance: ${error.message}`);
        } finally {
            setLoadingBalance(false);
        }
    }, []);

    // Import selected services
    const importServices = useCallback(async () => {
        if (selectedServices.size === 0) {
            toast.error('Please select at least one service to import');
            return;
        }

        setImportingServices(true);
        addLog(`Starting import of ${selectedServices.size} services...`);

        try {
            const servicesToImport = availableServices.filter((_, index) =>
                selectedServices.has(index)
            );

            let successCount = 0;
            let errorCount = 0;

            for (const service of servicesToImport) {
                try {
                    const serviceData = {
                        worldofsmm_service_id: String(service.id),
                        platform: service.platform || 'other',
                        service_type: service.type || 'default',
                        name: service.name,
                        rate: service.rate,
                        min_quantity: service.min_quantity,
                        max_quantity: service.max_quantity,
                        description: service.description,
                        enabled: true,
                        provider: 'worldofsmm'
                    };

                    const { error: insertError } = await supabase
                        .from('services')
                        .upsert(serviceData, { onConflict: 'worldofsmm_service_id' });

                    if (insertError) throw insertError;

                    successCount++;
                    addLog(`Successfully imported "${service.name}"`);
                } catch (error) {
                    errorCount++;
                    addLog(`Error importing "${service.name}": ${error.message}`);
                }
            }

            addLog(`Import completed: ${successCount} successful, ${errorCount} failed`);
            toast.success(`Imported ${successCount} services successfully`);
            setSelectedServices(new Set());
        } catch (error) {
            addLog(`Import error: ${error.message}`);
            toast.error(`Import failed: ${error.message}`);
        } finally {
            setImportingServices(false);
        }
    }, [selectedServices, availableServices]);

    const toggleServiceSelection = (index) => {
        setSelectedServices(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) newSet.delete(index);
            else newSet.add(index);
            return newSet;
        });
    };

    return (
        <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">World of SMM API Configuration</h2>
                <p className="text-sm text-gray-600 mb-6">
                    Configure your World of SMM API credentials and manage service synchronization
                </p>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="w-5 h-5" />
                            API Settings
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                            <p className="text-sm text-blue-800">
                                <strong>Note:</strong> Set <code className="bg-blue-100 px-1 rounded">WORLDOFSMM_API_KEY</code> and <code className="bg-blue-100 px-1 rounded">WORLDOFSMM_API_URL</code> in Vercel environment variables.
                            </p>
                        </div>
                        <div>
                            <Label className="flex items-center gap-2 mb-2"><Globe className="w-4 h-4" /> API Base URL (Reference)</Label>
                            <Input value={apiUrl} disabled className="w-full" />
                        </div>
                        <div>
                            <Label className="flex items-center gap-2 mb-2"><Key className="w-4 h-4" /> API Key (Reference)</Label>
                            <Input type="password" value={apiKey} disabled className="w-full" />
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={testConnection} disabled={testingConnection} className="flex items-center gap-2">
                                {testingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                                Test Connection
                            </Button>
                        </div>
                        {connectionStatus && (
                            <div className={`p-3 rounded-lg border ${connectionStatus === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                                {connectionMessage}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="mb-6">
                    <CardHeader><CardTitle className="flex items-center gap-2"><Server className="w-5 h-5" /> Account Balance</CardTitle></CardHeader>
                    <CardContent className="flex items-center justify-between">
                        <div className="text-2xl font-bold">{balance !== null ? `$${balance.toFixed(2)}` : 'Not loaded'}</div>
                        <Button onClick={fetchBalance} disabled={loadingBalance} variant="outline" className="flex items-center gap-2">
                            {loadingBalance ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Refresh Balance
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Download className="w-5 h-5" /> Service Synchronization</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <Button onClick={syncServices} disabled={syncingServices} className="flex items-center gap-2">
                            {syncingServices ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Sync Services
                        </Button>

                        {availableServices.length > 0 && (
                            <div className="mt-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-gray-900">Available Services ({availableServices.length})</h3>
                                    <div className="flex gap-2">
                                        <Button onClick={() => setSelectedServices(new Set(availableServices.map((_, i) => i)))} variant="outline" size="sm">Select All</Button>
                                        <Button onClick={() => setSelectedServices(new Set())} variant="outline" size="sm">Deselect All</Button>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {availableServices.map((service, index) => (
                                        <div
                                            key={index}
                                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedServices.has(index) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                                            onClick={() => toggleServiceSelection(index)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-medium text-gray-900">{service.name}</p>
                                                    <p className="text-sm text-gray-600">ID: {service.id} | Category: {service.category} | Rate: ${service.rate}</p>
                                                </div>
                                                {selectedServices.has(index) && <CheckCircle className="w-5 h-5 text-blue-500" />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <Button onClick={importServices} disabled={importingServices || selectedServices.size === 0} className="mt-4 flex items-center gap-2">
                                    {importingServices ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    Import Selected ({selectedServices.size})
                                </Button>
                            </div>
                        )}

                        {syncLogs.length > 0 && (
                            <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                                <h3 className="font-semibold text-gray-900 mb-2">Sync Logs</h3>
                                {syncLogs.map((log, index) => (
                                    <div key={index} className="text-sm text-gray-700 mb-1">
                                        <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AdminWorldOfSMM;
