import React, { useState, useEffect } from 'react';
import { getSupportMetrics, getAdminPerformance } from '@/lib/support-analytics';
import { SupportCharts } from '@/components/support/admin/SupportCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';

const AdminSupportAnalytics = () => {
  const [metrics, setMetrics] = useState(null);
  const [performance, setPerformance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadAnalytics();
  }, [startDate, endDate]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [metricsData, performanceData] = await Promise.all([
        getSupportMetrics(startDate || undefined, endDate || undefined),
        getAdminPerformance(startDate || undefined, endDate || undefined),
      ]);
      setMetrics(metricsData);
      setPerformance(performanceData);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading analytics...</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-6">
        <p>Failed to load analytics</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Support Analytics</h1>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
          <span>to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
          <Button onClick={loadAnalytics} variant="outline">
            <Calendar className="w-4 h-4 mr-2" />
            Apply
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <SupportCharts metrics={metrics} />

      {/* Admin Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin</TableHead>
                <TableHead>Conversations Handled</TableHead>
                <TableHead>Messages Sent</TableHead>
                <TableHead>Avg Response Time</TableHead>
                <TableHead>Avg Resolution Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.map((admin) => (
                <TableRow key={admin.admin_id}>
                  <TableCell>{admin.admin_name}</TableCell>
                  <TableCell>{admin.conversations_handled}</TableCell>
                  <TableCell>{admin.messages_sent}</TableCell>
                  <TableCell>
                    {admin.average_response_time > 0
                      ? `${Math.round(admin.average_response_time / 60)}m`
                      : 'N/A'}
                  </TableCell>
                  <TableCell>
                    {admin.average_resolution_time > 0
                      ? `${Math.round(admin.average_resolution_time / 3600)}h`
                      : 'N/A'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSupportAnalytics;

