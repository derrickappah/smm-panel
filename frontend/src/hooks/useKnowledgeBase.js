import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// Fetch all published knowledge base articles
const fetchKnowledgeBase = async (searchTerm = '', category = '') => {
  let query = supabase
    .from('knowledge_base_articles')
    .select('id, title, content, category, tags, views, helpful_count, not_helpful_count, created_at')
    .eq('published', true)
    .order('views', { ascending: false });

  if (searchTerm) {
    query = query.or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`);
  }

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    if (error.code === '42P01') {
      console.warn('Knowledge base table may not exist. Run CREATE_KNOWLEDGE_BASE.sql migration.');
      return [];
    }
    throw error;
  }

  return data || [];
};

// Fetch single article
const fetchArticle = async (articleId) => {
  const { data, error } = await supabase
    .from('knowledge_base_articles')
    .select('*')
    .eq('id', articleId)
    .eq('published', true)
    .single();

  if (error) throw error;
  return data;
};

// Increment article views
const incrementViews = async (articleId) => {
  const { error } = await supabase.rpc('increment_kb_article_views', {
    article_id: articleId
  });

  if (error) throw error;
};

// Submit helpful feedback
const submitFeedback = async (articleId, isHelpful) => {
  const field = isHelpful ? 'helpful_count' : 'not_helpful_count';
  const { error } = await supabase
    .from('knowledge_base_articles')
    .update({
      [field]: supabase.raw(`${field} + 1`)
    })
    .eq('id', articleId);

  if (error) throw error;
};

export const useKnowledgeBase = (searchTerm = '', category = '') => {
  return useQuery({
    queryKey: ['knowledge_base', searchTerm, category],
    queryFn: () => fetchKnowledgeBase(searchTerm, category),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useKnowledgeBaseArticle = (articleId) => {
  return useQuery({
    queryKey: ['knowledge_base', 'article', articleId],
    queryFn: () => fetchArticle(articleId),
    enabled: !!articleId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useIncrementArticleViews = () => {
  return useMutation({
    mutationFn: incrementViews,
  });
};

export const useSubmitArticleFeedback = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ articleId, isHelpful }) => submitFeedback(articleId, isHelpful),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge_base'] });
      toast.success('Thank you for your feedback!');
    },
    onError: (error) => {
      toast.error('Failed to submit feedback');
    },
  });
};






