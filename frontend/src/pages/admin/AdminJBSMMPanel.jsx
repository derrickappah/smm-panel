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
import { fetchJBSMMPanelServices, getJBSMMPanelBalance } from '@/lib/jbsmmpanel';
import { supabase } from '@/lib/supabase';

const AdminJBSMMPanel = () => {
  const [apiUrl, setApiUrl] = useState('');
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
    const savedApiUrl = localStorage.getItem('jbsmmpanel_api_url');
    const savedApiKey = localStorage.getItem('jbsmmpanel_api_key');
    if (savedApiUrl) setApiUrl(savedApiUrl);
    if (savedApiKey) setApiKey(savedApiKey);
  }, []);

  // Save API configuration to localStorage
  const saveConfig = useCallback(() => {
    localStorage.setItem('jbsmmpanel_api_url', apiUrl);
    localStorage.setItem('jbsmmpanel_api_key', apiKey);
    toast.success('API configuration saved');
  }, [apiUrl, apiKey]);

  // Test API connection
  const testConnection = useCallback(async () => {
    setTestingConnection(true);
    setConnectionStatus(null);
    setConnectionMessage('');

    try {
      // Test by fetching balance (lightweight operation)
      // Note: API credentials must be set in Vercel environment variables
      const response = await fetch('/api/jbsmmpanel/balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        setConnectionStatus('error');
        setConnectionMessage(`HTTP ${response.status}: ${response.statusText}`);
        toast.error('Connection test failed: Invalid response from server');
        return;
      }
      
      // Check for errors in response body (API might return errors with 200 status)
      if (data && data.error) {
        const errorMessage = data.error || 'Connection test failed';
        setConnectionStatus('error');
        setConnectionMessage(errorMessage);
        
        // Show helpful message if API is not configured
        if (data.configIssue || errorMessage.includes('not configured')) {
          toast.error('JB SMM Panel API is not configured. Please set JBSMMPANEL_API_KEY and JBSMMPANEL_API_URL in Vercel environment variables.');
        } else {
          toast.error(`Connection test failed: ${errorMessage}`);
        }
      } else if (response.ok && data && !data.error) {
        setConnectionStatus('success');
        setConnectionMessage('Successfully connected to JB SMM Panel API');
        toast.success('Connection test successful');
      } else {
        const errorMessage = data?.error || data?.message || `HTTP ${response.status}: ${response.statusText}`;
        setConnectionStatus('error');
        setConnectionMessage(errorMessage);
        
        // Show helpful message if API is not configured
        if (data?.configIssue || errorMessage.includes('not configured')) {
          toast.error('JB SMM Panel API is not configured. Please set JBSMMPANEL_API_KEY and JBSMMPANEL_API_URL in Vercel environment variables.');
        } else {
          toast.error(`Connection test failed: ${errorMessage}`);
        }
      }
    } catch (error) {
      setConnectionStatus('error');
      const errorMessage = error.message || 'Failed to connect';
      setConnectionMessage(errorMessage);
      
      // Check if it's a configuration error
      if (errorMessage.includes('not configured')) {
        toast.error('JB SMM Panel API is not configured. Please set JBSMMPANEL_API_KEY and JBSMMPANEL_API_URL in Vercel environment variables.');
      } else {
        toast.error(`Connection test failed: ${errorMessage}`);
      }
    } finally {
      setTestingConnection(false);
    }
  }, []);

  // Fetch available services from JB SMM Panel
  const syncServices = useCallback(async () => {
    setSyncingServices(true);
    setSyncLogs([]);
    addLog('Starting service sync...');

    try {
      const services = await fetchJBSMMPanelServices();
      
      if (Array.isArray(services) && services.length > 0) {
        // Log first service structure for debugging
        console.log('Sample JB SMM Panel service structure:', JSON.stringify(services[0], null, 2));
        addLog(`Sample service fields: ${Object.keys(services[0]).join(', ')}`);
        
        setAvailableServices(services);
        addLog(`Successfully fetched ${services.length} services from JB SMM Panel`);
        toast.success(`Fetched ${services.length} services from JB SMM Panel`);
      } else {
        addLog('No services found or invalid response format');
        toast.warning('No services found or invalid response format');
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
      const balanceData = await getJBSMMPanelBalance();
      
      // Extract balance from various possible response formats
      // Common field names: balance, amount, current_balance, balance_amount, etc.
      let balanceValue = balanceData?.balance || 
                        balanceData?.amount || 
                        balanceData?.current_balance || 
                        balanceData?.balance_amount ||
                        balanceData?.data?.balance ||
                        balanceData?.data?.amount ||
                        null;
      
      // Convert to number if it's a string
      if (balanceValue !== null && balanceValue !== undefined) {
        const numBalance = typeof balanceValue === 'string' 
          ? parseFloat(balanceValue.replace(/[^0-9.-]/g, '')) 
          : Number(balanceValue);
        
        // Validate it's a valid number
        if (!isNaN(numBalance) && isFinite(numBalance)) {
          setBalance(numBalance);
          toast.success('Balance fetched successfully');
        } else {
          console.warn('Invalid balance value received:', balanceValue);
          setBalance(null);
          toast.warning('Could not parse balance information');
        }
      } else {
        console.warn('Balance not found in API response:', balanceData);
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
      let skippedCount = 0;

      // Helper function to normalize platform to valid database values
      const normalizePlatform = (platform) => {
        if (!platform) return 'instagram'; // Default fallback
        
        const platformLower = platform.toLowerCase().trim();
        
        // Map common platform names to database values
        const platformMap = {
          'instagram': 'instagram',
          'ig': 'instagram',
          'tiktok': 'tiktok',
          'tt': 'tiktok',
          'youtube': 'youtube',
          'yt': 'youtube',
          'facebook': 'facebook',
          'fb': 'facebook',
          'twitter': 'twitter',
          'x': 'twitter',
          'whatsapp': 'whatsapp',
          'wa': 'whatsapp',
          'telegram': 'telegram',
          'tg': 'telegram'
        };
        
        // Check direct match or mapped value
        if (platformMap[platformLower]) {
          return platformMap[platformLower];
        }
        
        // Check if it contains any of the valid platform names
        for (const [key, value] of Object.entries(platformMap)) {
          if (platformLower.includes(key)) {
            return value;
          }
        }
        
        // Default fallback to instagram (valid platform)
        return 'instagram';
      };

      for (const service of servicesToImport) {
        try {
          // Extract service ID - JB SMM Panel uses "service" field (numeric)
          const jbsmmpanelServiceId = service.service || service.id || service.service_id || service.serviceId || service.ID;
          
          // Validate that we have a service ID
          if (!jbsmmpanelServiceId && jbsmmpanelServiceId !== 0) {
            addLog(`Service "${service.name || 'Unknown'}" has no valid ID, skipping...`);
            errorCount++;
            continue;
          }

          // Extract platform from category field
          // Category format examples: "First Category", "Second Category"
          // Try to extract platform from category or use type field
          const category = service.category || '';
          const rawPlatform = service.platform || category.split(' ')[0] || '';
          const normalizedPlatform = normalizePlatform(rawPlatform);

          // Extract service type from type field or name
          // Type field examples: "Default", "Custom Comments", "Package", etc.
          let serviceType = service.type || 'other';
          if (serviceType === 'Default' && service.name) {
            // Try to extract service type from name (e.g., "Followers", "Likes", "Views")
            const nameLower = service.name.toLowerCase();
            if (nameLower.includes('follower')) serviceType = 'followers';
            else if (nameLower.includes('like')) serviceType = 'likes';
            else if (nameLower.includes('view')) serviceType = 'views';
            else if (nameLower.includes('comment')) serviceType = 'comments';
            else if (nameLower.includes('share')) serviceType = 'shares';
            else serviceType = 'other';
          }

          // Parse rate - JB SMM Panel returns it as a string
          const rateValue = service.rate ? parseFloat(service.rate) : 0;

          // Map service from JB SMM Panel format to our database format
          const serviceData = {
            jbsmmpanel_service_id: jbsmmpanelServiceId,
            platform: normalizedPlatform,
            service_type: serviceType,
            name: service.name || 'Unknown Service',
            rate: rateValue, // Use actual rate from API (admin can adjust later)
            min_quantity: parseInt(service.min || 0, 10),
            max_quantity: parseInt(service.max || 0, 10),
            description: service.description || service.desc || category || '',
            enabled: true
          };

          // Validate required fields
          if (!serviceData.name || serviceData.name === 'Unknown Service') {
            addLog(`Service with ID ${jbsmmpanelServiceId} has no name, skipping...`);
            errorCount++;
            continue;
          }

          // Check if service already exists (only if we have a valid ID)
          if (jbsmmpanelServiceId !== null && jbsmmpanelServiceId !== undefined) {
            const { data: existing } = await supabase
              .from('services')
              .select('id')
              .eq('jbsmmpanel_service_id', jbsmmpanelServiceId)
              .maybeSingle();

            if (existing) {
              addLog(`Service "${serviceData.name}" already exists, skipping...`);
              skippedCount++;
              continue;
            }
          }

          // Log the service data being inserted for debugging
          console.log('Attempting to insert service:', JSON.stringify(serviceData, null, 2));

          // Insert service
          const { data: insertedData, error: insertError } = await supabase
            .from('services')
            .insert(serviceData)
            .select();

          if (insertError) {
            // Enhanced error logging with full context
            const errorDetails = {
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint,
              code: insertError.code,
              serviceData: JSON.stringify(serviceData, null, 2),
              originalService: JSON.stringify(service, null, 2)
            };
            console.error('Service import error - Full details:', errorDetails);
            addLog(`Failed: ${serviceData.name} - ${insertError.message}${insertError.details ? ` (${insertError.details})` : ''}`);
            throw new Error(`${insertError.message}${insertError.details ? ` - ${insertError.details}` : ''}${insertError.hint ? ` (${insertError.hint})` : ''}`);
          }

          console.log('Successfully inserted service:', insertedData);

          successCount++;
          addLog(`Successfully imported "${serviceData.name}" (Platform: ${normalizedPlatform})`);
        } catch (error) {
          errorCount++;
          const errorMsg = error.message || 'Unknown error';
          addLog(`Error importing "${service.name || service.service_name || 'Unknown'}": ${errorMsg}`);
          console.error('Service import error:', error);
        }
      }

      addLog(`Import completed: ${successCount} successful, ${errorCount} failed, ${skippedCount} skipped (already exist)`);
      
      if (successCount > 0) {
        toast.success(`Imported ${successCount} services successfully`);
      } else if (skippedCount > 0) {
        toast.info(`${skippedCount} services were skipped because they already exist`);
      } else if (errorCount > 0) {
        toast.error(`${errorCount} services failed to import`);
      } else {
        toast.warning('No services were imported');
      }
      
      if (errorCount > 0) {
        toast.warning(`${errorCount} services failed to import`);
      }

      // Clear selection and refresh
      setSelectedServices(new Set());
      setAvailableServices([]);
    } catch (error) {
      addLog(`Import error: ${error.message}`);
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setImportingServices(false);
    }
  }, [selectedServices, availableServices]);

  const addLog = (message) => {
    setSyncLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      message
    }]);
  };

  const toggleServiceSelection = (index) => {
    setSelectedServices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const selectAllServices = () => {
    setSelectedServices(new Set(availableServices.map((_, index) => index)));
  };

  const deselectAllServices = () => {
    setSelectedServices(new Set());
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">JB SMM Panel API Configuration</h2>
        <p className="text-sm text-gray-600 mb-6">
          Configure your JB SMM Panel API credentials and manage service synchronization
        </p>

        {/* API Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              API Settings
            </CardTitle>
            <CardDescription>
              Configure your JB SMM Panel API URL and API Key
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> API credentials must be configured as environment variables in Vercel:
                <br />
                • <code className="bg-blue-100 px-1 rounded">JBSMMPANEL_API_URL</code> - Base URL for JB SMM Panel API
                <br />
                • <code className="bg-blue-100 px-1 rounded">JBSMMPANEL_API_KEY</code> - Your JB SMM Panel API key
                <br />
                <br />
                The fields below are for reference only. Set the environment variables in your Vercel project settings.
              </p>
            </div>
            <div>
              <Label htmlFor="api-url" className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4" />
                API Base URL (Reference)
              </Label>
              <Input
                id="api-url"
                type="text"
                placeholder="https://jbsmmpanel.com/api/v2"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full"
                disabled
              />
              <p className="text-xs text-gray-500 mt-1">Set JBSMMPANEL_API_URL in Vercel environment variables</p>
            </div>
            <div>
              <Label htmlFor="api-key" className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4" />
                API Key (Reference)
              </Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Enter your JB SMM Panel API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full"
                disabled
              />
              <p className="text-xs text-gray-500 mt-1">Set JBSMMPANEL_API_KEY in Vercel environment variables</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveConfig} variant="outline" disabled>
                Save Configuration (Disabled)
              </Button>
              <Button 
                onClick={testConnection} 
                disabled={testingConnection}
                className="flex items-center gap-2"
              >
                {testingConnection ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Server className="w-4 h-4" />
                    Test Connection
                  </>
                )}
              </Button>
            </div>
            {connectionStatus && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                connectionStatus === 'success' 
                  ? 'bg-green-50 text-green-800 border border-green-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {connectionStatus === 'success' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                <span className="text-sm font-medium">{connectionMessage}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Balance */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Account Balance
            </CardTitle>
            <CardDescription>
              Check your JB SMM Panel account balance
            </CardDescription>
          </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  {balance !== null && typeof balance === 'number' && !isNaN(balance) ? (
                    <p className="text-2xl font-bold text-gray-900">${balance.toFixed(2)}</p>
                  ) : (
                    <p className="text-gray-500">Not loaded</p>
                  )}
                </div>
              <Button 
                onClick={fetchBalance} 
                disabled={loadingBalance}
                variant="outline"
                className="flex items-center gap-2"
              >
                {loadingBalance ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Refresh Balance
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Service Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Service Synchronization
            </CardTitle>
            <CardDescription>
              Fetch and import services from JB SMM Panel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={syncServices} 
              disabled={syncingServices}
              className="flex items-center gap-2"
            >
              {syncingServices ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Sync Services from JB SMM Panel
                </>
              )}
            </Button>

            {availableServices.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">
                    Available Services ({availableServices.length})
                  </h3>
                  <div className="flex gap-2">
                    <Button onClick={selectAllServices} variant="outline" size="sm">
                      Select All
                    </Button>
                    <Button onClick={deselectAllServices} variant="outline" size="sm">
                      Deselect All
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableServices.map((service, index) => (
                    <div
                      key={index}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedServices.has(index)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => toggleServiceSelection(index)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {service.name || service.service_name || 'Unknown Service'}
                          </p>
                          <p className="text-sm text-gray-600">
                            ID: {service.service || service.id || service.service_id || 'N/A'} | 
                            Category: {service.category || 'Unknown'} | 
                            Type: {service.type || 'Unknown'} | 
                            Min: {service.min || service.min_quantity || 0} - 
                            Max: {service.max || service.max_quantity || 0}
                          </p>
                        </div>
                        {selectedServices.has(index) && (
                          <CheckCircle className="w-5 h-5 text-blue-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={importServices}
                    disabled={importingServices || selectedServices.size === 0}
                    className="flex items-center gap-2"
                  >
                    {importingServices ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Import Selected ({selectedServices.size})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Sync Logs */}
            {syncLogs.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold text-gray-900 mb-2">Sync Logs</h3>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                  {syncLogs.map((log, index) => (
                    <div key={index} className="text-sm text-gray-700 mb-1">
                      <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminJBSMMPanel;
