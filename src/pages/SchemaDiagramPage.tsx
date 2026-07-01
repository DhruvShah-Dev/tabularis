import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SchemaDiagram } from '../components/ui/SchemaDiagram';
import { resolveDiagramSchema } from '../utils/schemaDiagram';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DatabaseProvider } from '../contexts/DatabaseProvider';
import { EditorProvider } from '../contexts/EditorProvider';

export const SchemaDiagramPage = () => {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchParams] = useSearchParams();
  const connectionId = searchParams.get('connectionId');
  const connectionName = searchParams.get('connectionName') || 'Unknown';
  const databaseName = searchParams.get('databaseName') || 'Unknown';
  const schema = searchParams.get('schema') || undefined;
  // Schema-based multi-database (PostgreSQL): the database the schema lives in,
  // so the diagram's metadata fetch routes to the right connection pool.
  const database = searchParams.get('database') || undefined;

  // On a single connection that exposes multiple databases (e.g. MySQL), the
  // diagram must be scoped to the selected database rather than the connection's
  // primary one. See resolveDiagramSchema for the full rationale.
  //
  // When a `database` param is present (schema-based multi-database, i.e.
  // PostgreSQL), the pool is already routed by it, so `databaseName` must NOT
  // be reused as a schema fallback — it is a database name, and treating it as
  // a schema would set search_path to a non-existent schema.
  const effectiveSchema = database
    ? schema
    : resolveDiagramSchema(schema, databaseName);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Listen for fullscreen changes (e.g., ESC key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Show error if no connectionId
  if (!connectionId) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-base">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-primary mb-2">
            {t('erDiagram.noConnection')}
          </h1>
          <p className="text-secondary">
            {t('erDiagram.noConnectionDesc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <DatabaseProvider>
      <EditorProvider>
        <div className="w-screen h-screen flex flex-col bg-base">
          {/* Minimal Header */}
          <div className="h-12 bg-elevated border-b border-default flex items-center justify-between px-4 shrink-0">
            <h1 className="text-primary font-semibold">
              {databaseName}{schema ? ` / ${schema}` : ''} ({connectionName})
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary text-primary rounded-lg border border-strong transition-colors text-sm"
                title={t('sidebar.refresh')}
              >
                <RefreshCw size={16} />
                {t('sidebar.refresh')}
              </button>
              <button
                onClick={toggleFullscreen}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary text-primary rounded-lg border border-strong transition-colors text-sm"
                title={isFullscreen ? t('erDiagram.exitFullscreen') : t('erDiagram.enterFullscreen')}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 size={16} />
                    {t('erDiagram.exitFullscreen')}
                  </>
                ) : (
                  <>
                    <Maximize2 size={16} />
                    {t('erDiagram.enterFullscreen')}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Diagram Canvas */}
          <div className="flex-1 overflow-hidden">
            <SchemaDiagram connectionId={connectionId} refreshTrigger={refreshTrigger} schema={effectiveSchema} database={database} />
          </div>
        </div>
      </EditorProvider>
    </DatabaseProvider>
  );
};
