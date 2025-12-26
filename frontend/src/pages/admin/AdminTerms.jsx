import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Save, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTerms, useUpdateTerms } from '@/hooks/useTerms';

const AdminTerms = () => {
  const { data: termsData, isLoading } = useTerms();
  const updateTerms = useUpdateTerms();
  const [content, setContent] = useState('');

  // Update local state when data loads
  React.useEffect(() => {
    if (termsData?.content) {
      setContent(termsData.content);
    }
  }, [termsData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!content.trim()) {
      toast.error('Terms and conditions content cannot be empty');
      return;
    }

    try {
      await updateTerms.mutateAsync(content);
      toast.success('Terms and conditions updated successfully');
    } catch (error) {
      toast.error(error.message || 'Failed to update terms and conditions');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Terms and Conditions</h2>
          <p className="text-sm text-gray-500">
            Manage the terms and conditions that users must accept during signup
          </p>
        </div>
      </div>

      {termsData?.updated_at && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            <span className="font-medium">Last Updated:</span>{' '}
            {new Date(termsData.updated_at).toLocaleString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="terms-content" className="text-sm font-medium text-gray-700 mb-2 block">
            Terms and Conditions Content
          </Label>
          <Textarea
            id="terms-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter terms and conditions content..."
            className="w-full min-h-[500px] font-mono text-sm"
            required
          />
          <p className="mt-2 text-xs text-gray-500">
            This content will be displayed to users during signup and on the /terms page. 
            Use plain text formatting. Line breaks will be preserved.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <Button
            type="submit"
            disabled={updateTerms.isPending || !content.trim()}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {updateTerms.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Preview</h3>
        <p className="text-xs text-blue-700 mb-2">
          Users will see this content in:
        </p>
        <ul className="text-xs text-blue-700 list-disc list-inside space-y-1">
          <li>Signup form (Terms and Conditions dialog)</li>
          <li>Standalone /terms page</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminTerms;

