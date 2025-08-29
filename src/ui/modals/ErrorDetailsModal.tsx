
import React, { useState, useCallback } from 'react';
import { ErrorReport } from '../../utils/error-reporter';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/Modal';

export interface ErrorDetailsModalProps {
  error: ErrorReport | null;
  isOpen: boolean;
  onClose: () => void;
  onCopyDetails?: (error: ErrorReport) => void;
  onReportIssue?: (error: ErrorReport) => void;
  showStackTrace?: boolean;
}

const ErrorDetailsModal: React.FC<ErrorDetailsModalProps> = ({
  error,
  isOpen,
  onClose,
  onCopyDetails,
  onReportIssue,
  showStackTrace = process.env.NODE_ENV === 'development'
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'stack' | 'context' | 'recovery'>('overview');

  const handleCopyDetails = useCallback(async () => {
    if (!error) return;

    const details = {
      id: error.id,
      timestamp: error.timestamp.toISOString(),
      category: error.category,
      severity: error.severity,
      message: error.originalError.message,
      stack: error.stackTrace,
      context: error.context,
      userAgent: error.userAgent,
      url: error.url,
      sessionId: error.sessionId
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(details, null, 2));
      // Could show a toast notification here
      console.log('Error details copied to clipboard');
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }

    onCopyDetails?.(error);
  }, [error, onCopyDetails]);

  const handleReportIssue = useCallback(() => {
    if (!error) return;

    const issueBody = encodeURIComponent(`
## Error Report

**Error ID:** ${error.id}
**Timestamp:** ${error.timestamp.toISOString()}
**Category:** ${error.category}
**Severity:** ${error.severity}

### Error Message
${error.originalError.message}

### Stack Trace
\`\`\`
${error.stackTrace || 'No stack trace available'}
\`\`\`

### Context
\`\`\`json
${JSON.stringify(error.context, null, 2)}
\`\`\`

### Environment
- User Agent: ${error.userAgent || 'Unknown'}
- URL: ${error.url || 'Unknown'}
- Session ID: ${error.sessionId || 'Unknown'}

### Suggestions
${error.userMessage.suggestions.map(s => `- ${s}`).join('\n')}
    `);

    const issueUrl = `https://github.com/your-repo/issues/new?title=Error Report: ${error.category} - ${error.originalError.message.substring(0, 50)}&body=${issueBody}`;
    window.open(issueUrl, '_blank');

    onReportIssue?.(error);
  }, [error, onReportIssue]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'high':
        return 'text-red-500 bg-red-50 border-red-200';
      case 'medium':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'low':
      default:
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'high':
        return '⚠️';
      case 'medium':
        return '⚡';
      case 'low':
      default:
        return 'ℹ️';
    }
  };

  if (!error) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      labelledBy="error-details-title"
      ariaLabel="Error Details"
    >
      <ModalHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">{getSeverityIcon(error.severity)}</span>
            <div>
              <h2 id="error-details-title" className="text-lg font-semibold text-gray-900">
                {error.userMessage.title}
              </h2>
              <p className="text-sm text-gray-600">
                Error ID: {error.id}
              </p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getSeverityColor(error.severity)}`}>
            {error.severity.toUpperCase()}
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'stack', label: 'Stack Trace' },
              { id: 'context', label: 'Context' },
              { id: 'recovery', label: 'Recovery' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'overview' | 'stack' | 'context' | 'recovery')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="min-h-64">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Error Message</h3>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border">
                  {error.originalError.message}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">User-Friendly Message</h3>
                <p className="text-sm text-gray-700">{error.userMessage.message}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Suggestions</h3>
                <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                  {error.userMessage.suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-900">Category:</span>
                  <span className="ml-2 text-gray-700">{error.category}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-900">Timestamp:</span>
                  <span className="ml-2 text-gray-700">{error.timestamp.toLocaleString()}</span>
                </div>
                {error.userAgent && (
                  <div className="col-span-2">
                    <span className="font-medium text-gray-900">User Agent:</span>
                    <span className="ml-2 text-gray-700 break-all">{error.userAgent}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'stack' && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Stack Trace</h3>
              {showStackTrace ? (
                error.stackTrace ? (
                  <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded overflow-auto max-h-96 whitespace-pre-wrap">
                    {error.stackTrace}
                  </pre>
                ) : (
                  <p className="text-sm text-gray-500 italic">No stack trace available</p>
                )
              ) : (
                <p className="text-sm text-gray-500 italic">Stack trace hidden in production</p>
              )}
            </div>
          )}

          {activeTab === 'context' && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Error Context</h3>
              {error.context ? (
                <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto max-h-96 whitespace-pre-wrap">
                  {JSON.stringify(error.context, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-gray-500 italic">No context information available</p>
              )}
            </div>
          )}

          {activeTab === 'recovery' && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Recovery Actions</h3>
              {error.recoveryActions && error.recoveryActions.length > 0 ? (
                <div className="space-y-2">
                  {error.recoveryActions.map((action, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                      <div>
                        <span className="font-medium text-gray-900">{action.label}</span>
                        {action.primary && (
                          <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                            Primary
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => action.action()}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        Execute
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No recovery actions available</p>
              )}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="flex justify-between w-full">
          <div className="flex space-x-2">
            <button
              onClick={handleCopyDetails}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Copy Details
            </button>
            <button
              onClick={handleReportIssue}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Report Issue
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Close
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
};

export default ErrorDetailsModal;
