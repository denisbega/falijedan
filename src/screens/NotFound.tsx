import { Compass } from 'lucide-react';
import { EmptyState, GlassButton, Page } from '../components/ui';

export function NotFound() {
  return (
    <Page>
      <div className="grid grid-cols-1 min-h-[60dvh] place-items-center">
        <EmptyState
          icon={Compass}
          title="Ova stranica ne postoji"
          text="Možda je link pogrešan. Vrati se na početnu i pronađi svoj sljedeći termin."
          action={
            <GlassButton to="/" size="md">
              Početna
            </GlassButton>
          }
        />
      </div>
    </Page>
  );
}
