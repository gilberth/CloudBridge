import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/empty-state';

export default function RemotesPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Remotes" />
      <EmptyState
        icon={Construction}
        title="Remotes en construcción"
        description="Esta vista se implementa en una fase posterior."
      />
    </div>
  );
}
