import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, Copy, Search, ExternalLink, ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from '../../lib/supabase';
import { getG1618Services, getG1618Balance } from '../../lib/g1618';

export default function AdminG1618() {
    const [balance, setBalance] = useState(null);
    const [currency, setCurrency] = useState('USD');
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState(null);
    const { toast } = useToast();

    // Helper to copy text
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast({ description: "Copied to clipboard", duration: 2000 });
    };

    const fetchBalance = async () => {
        try {
            setError(null);
            const data = await getG1618Balance();
            setBalance(data.balance);
            setCurrency(data.currency || 'USD');
            return true; // Success
        } catch (err) {
            console.error('Balance fetch error:', err);
            setError(err.message || "Failed to fetch balance. Check API key.");
            return false; // Failed
        }
    };

    const fetchServices = async () => {
        try {
            setLoading(true);
            const data = await getG1618Services();
            if (Array.isArray(data)) {
                setServices(data);
            } else {
                throw new Error("Invalid response format from G1618 API");
            }
        } catch (err) {
            console.error('Services fetch error:', err);
            toast({
                variant: "destructive",
                title: "Failed to fetch services",
                description: err.message
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await Promise.all([fetchBalance(), fetchServices()]);
        setRefreshing(false);
        toast({ description: "Data refreshed" });
    };

    // Initial load
    useEffect(() => {
        fetchServices();
        fetchBalance();
    }, []);

    // Filter services
    const filteredServices = services.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.service.toString().includes(searchTerm) ||
        s.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">G1618 Integration</h2>
                    <p className="text-muted-foreground">Manage connection and view services from G1618 SMM Panel</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => window.open('https://g1618.com/services', '_blank')}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View G1618 Services
                    </Button>
                    <Button onClick={handleRefresh} disabled={refreshing}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh Data
                    </Button>
                </div>
            </div>

            {/* Connection Status & Balance */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Connection Status</CardTitle>
                        {error ? <AlertCircle className="h-4 w-4 text-red-500" /> : <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{error ? "Error" : "Connected"}</div>
                        <p className="text-xs text-muted-foreground">
                            {error ? "Check API Key configuration" : "API connection established"}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Account Balance</CardTitle>
                        <span className="text-xs font-bold text-muted-foreground">{currency}</span>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {balance !== null ? balance : "---"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Available funds on G1618
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Services</CardTitle>
                        <Search className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{services.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Services available via API
                        </p>
                    </CardContent>
                </Card>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Connection Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Services List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>G1618 Services</CardTitle>
                            <CardDescription>Browse services to use their IDs for mapping</CardDescription>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search services..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : filteredServices.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No services found matching your search.
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <div className="grid grid-cols-12 border-b bg-muted/50 p-3 text-sm font-medium">
                                <div className="col-span-1">ID</div>
                                <div className="col-span-5">Service Name</div>
                                <div className="col-span-2">Category</div>
                                <div className="col-span-2 text-right">Rate (1k)</div>
                                <div className="col-span-2 text-right">Min / Max</div>
                            </div>
                            <div className="max-h-[600px] overflow-auto">
                                {filteredServices.map((service) => (
                                    <div key={service.service} className="grid grid-cols-12 items-center border-b p-3 text-sm hover:bg-muted/50 transition-colors">
                                        <div className="col-span-1 font-mono font-bold flex items-center gap-2">
                                            {service.service}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                                onClick={() => copyToClipboard(service.service)}
                                            >
                                                <Copy className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        <div className="col-span-5 font-medium">{service.name}</div>
                                        <div className="col-span-2 text-xs text-muted-foreground truncate" title={service.category}>
                                            {service.category}
                                        </div>
                                        <div className="col-span-2 text-right font-mono">
                                            ${service.rate}
                                        </div>
                                        <div className="col-span-2 text-right text-xs text-muted-foreground">
                                            {service.min} / {service.max}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="bg-muted p-4 rounded-lg">
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4" />
                    How to use these IDs
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Copy the <strong>ID</strong> of the service you want to use, then go to the <strong>Services</strong> tab.
                    Edit or create a service and paste this ID into the <strong>G1618 Service ID</strong> field.
                </p>
                <Button variant="secondary" size="sm" asChild>
                    <a href="/admin/services">Go to Services <ArrowRight className="ml-2 h-4 w-4" /></a>
                </Button>
            </div>
        </div>
    );
}
