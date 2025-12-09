import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { generateBreadcrumbSchema } from '@/utils/schema';
import SEO from '@/components/SEO';

const Breadcrumbs = ({ items, className = '' }) => {
  const location = useLocation();
  
  // Default breadcrumbs if none provided
  const defaultItems = items || [
    { name: 'Home', url: '/' }
  ];

  // Generate breadcrumb schema
  const breadcrumbSchema = generateBreadcrumbSchema(defaultItems);

  return (
    <>
      {breadcrumbSchema && (
        <SEO structuredDataArray={[breadcrumbSchema]} />
      )}
      <nav 
        className={`flex items-center space-x-2 text-sm ${className}`}
        aria-label="Breadcrumb"
      >
        <ol className="flex items-center space-x-2">
          {defaultItems.map((item, index) => {
            const isLast = index === defaultItems.length - 1;
            
            return (
              <li key={index} className="flex items-center">
                {index > 0 && (
                  <ChevronRight className="w-4 h-4 text-gray-400 mx-2" />
                )}
                {isLast ? (
                  <span className="text-gray-900 font-medium" aria-current="page">
                    {item.name}
                  </span>
                ) : (
                  <Link
                    to={item.url}
                    className="text-gray-600 hover:text-indigo-600 transition-colors flex items-center gap-1"
                  >
                    {index === 0 && <Home className="w-4 h-4" />}
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
};

export default Breadcrumbs;

