import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SupportMetrics } from '@/types/support';

interface SupportChartsProps {
  metrics: SupportMetrics;
}

export const SupportCharts: React.FC<SupportChartsProps> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Conversations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{metrics.total_conversations}</p>
        </CardContent>
      </Card>

      {/* Total Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{metrics.total_messages}</p>
        </CardContent>
      </Card>

      {/* Average Response Time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {metrics.average_response_time > 0
              ? `${Math.round(metrics.average_response_time / 60)}m`
              : 'N/A'}
          </p>
        </CardContent>
      </Card>

      {/* Average Resolution Time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Avg Resolution Time</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {metrics.average_resolution_time > 0
              ? `${Math.round(metrics.average_resolution_time / 3600)}h`
              : 'N/A'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

