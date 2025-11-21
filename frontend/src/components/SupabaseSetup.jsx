import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const SupabaseSetup = () => {
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-8 h-8 text-orange-500" />
            <CardTitle className="text-3xl">Supabase Configuration Required</CardTitle>
          </div>
          <CardDescription className="text-base">
            Please configure your Supabase credentials to use this application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Setup Required</AlertTitle>
            <AlertDescription>
              The application needs Supabase credentials to function. Follow the steps below to get started.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
                Get Your Supabase Credentials
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 ml-8">
                <li>Go to <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                  supabase.com <ExternalLink className="w-3 h-3" />
                </a> and sign up or log in</li>
                <li>Create a new project (or select an existing one)</li>
                <li>Wait for the project to be fully provisioned</li>
                <li>Go to <strong>Project Settings</strong> → <strong>API</strong></li>
                <li>Copy the <strong>Project URL</strong> and <strong>anon public</strong> key</li>
              </ol>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
                Update Your .env File
              </h3>
              <p className="text-sm text-green-800 mb-3 ml-8">
                Open <code className="bg-green-100 px-2 py-1 rounded">frontend/.env</code> and update with your credentials:
              </p>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm ml-8">
                <div className="flex items-center justify-between mb-2">
                  <span>REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard('REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co')}
                    className="h-6 px-2 text-green-400 hover:text-green-300"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span>REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard('REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here')}
                    className="h-6 px-2 text-green-400 hover:text-green-300"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <h3 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                <span className="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
                Set Up Database Schema
              </h3>
              <p className="text-sm text-purple-800 mb-3 ml-8">
                <strong>Important:</strong> You must set up the database tables for the app to work properly.
              </p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-purple-800 ml-8 mb-3">
                <li>Go to your Supabase Dashboard → <strong>SQL Editor</strong></li>
                <li>Open the file <code className="bg-purple-100 px-2 py-1 rounded">SUPABASE_DATABASE_SETUP.sql</code> from the project root</li>
                <li>Copy and paste the entire SQL script into the SQL Editor</li>
                <li>Click <strong>Run</strong> to execute the script</li>
                <li>Verify tables were created in <strong>Table Editor</strong></li>
              </ol>
              <p className="text-xs text-purple-700 ml-8 italic">
                This will create all required tables (profiles, services, orders, transactions) and set up Row Level Security policies.
              </p>
            </div>

            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <h3 className="font-semibold text-orange-900 mb-3 flex items-center gap-2">
                <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
                Restart the Development Server
              </h3>
              <p className="text-sm text-orange-800 ml-8">
                After updating the .env file, restart your development server:
              </p>
              <div className="bg-gray-900 text-orange-400 p-4 rounded-lg font-mono text-sm ml-8 mt-2">
                <div className="flex items-center justify-between">
                  <span>npm start</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard('npm start')}
                    className="h-6 px-2 text-orange-400 hover:text-orange-300"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => window.open('https://supabase.com', '_blank')}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to Supabase
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SupabaseSetup;



