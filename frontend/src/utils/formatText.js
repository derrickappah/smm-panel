/**
 * Simple markdown parser for terms and conditions
 * Supports:
 * - **text** for bold
 * - # Header for main headers (bold and larger)
 * - ## Subheader for subheaders (bold)
 * - Line breaks
 */
export const formatTermsText = (text) => {
  if (!text) return '';

  // Split by lines to handle headers
  const lines = text.split('\n');
  
  return lines.map((line, index) => {
    let formattedLine = line;

    // Handle headers - check for ## or # at the start (with or without space)
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('##')) {
      // Subheader (##) - remove ## and any following space
      const content = trimmedLine.replace(/^##\s*/, '');
      return (
        <h3 key={index} className="text-lg font-bold text-gray-900 mt-6 mb-3">
          {formatBoldText(content)}
        </h3>
      );
    } else if (trimmedLine.startsWith('#')) {
      // Main header (#) - remove # and any following space
      const content = trimmedLine.replace(/^#\s*/, '');
      return (
        <h2 key={index} className="text-xl font-bold text-gray-900 mt-8 mb-4">
          {formatBoldText(content)}
        </h2>
      );
    } else if (trimmedLine === '') {
      // Empty line
      return <br key={index} />;
    } else {
      // Regular paragraph
      return (
        <p key={index} className="mb-3">
          {formatBoldText(formattedLine)}
        </p>
      );
    }
  });
};

/**
 * Format bold text within a line
 * Converts **text** to <strong>text</strong>
 */
const formatBoldText = (text) => {
  const parts = [];
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before the bold
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    // Add bold text
    parts.push(<strong key={match.index} className="font-bold">{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

