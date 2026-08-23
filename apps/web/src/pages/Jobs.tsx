import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/empty-state';

export default function JobsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Jobs" />
      <EmptyState
        icon={Construction}
        title="Jobs en construcción"
        description="Esta vista se implementa en una fase posterior."
      />
    </div>
  );
}
