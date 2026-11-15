import { Clock, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface HistoryEntry {
  id: string;
  version: number;
  title: string;
  changedBy: string;
  changedAt: Date;
}

export function VersionHistory({ history }: { history: HistoryEntry[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          Version History ({history.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 divide-y">
        {history.map((entry) => (
          <div key={entry.id} className="py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-xs font-mono shrink-0">
                v{entry.version}
              </Badge>
              <span className="text-sm text-foreground line-clamp-1">{entry.title}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
              <User className="h-3.5 w-3.5" />
              <span>
                {new Date(entry.changedAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
