import { Link, useNavigate } from 'react-router';
import { Bell } from 'lucide-react';
import { useMe, useUnread } from '../../lib/hooks';
import { GlassAvatar, IconButton } from '../ui';

/** Zvono obavještenja (pulsirajuća zelena tačka) + avatar sa zelenim prstenom. */
export function TopActions() {
  const me = useMe();
  const { notifications } = useUnread();
  const navigate = useNavigate();
  if (!me) return null;
  return (
    <div className="flex items-center gap-2.5">
      <IconButton icon={Bell} label={notifications ? `Obavještenja (${notifications} novih)` : 'Obavještenja'} badge={notifications > 0} onClick={() => navigate('/obavjestenja')} />
      <Link to="/profil" aria-label="Moj profil" className="rounded-full">
        <GlassAvatar user={me} size={44} ring />
      </Link>
    </div>
  );
}
