import { KeyRound, Video } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface Props {
  onAskLogin: () => void;
  /** Opens the video picker. */
  onSendVideo: () => void;
}

/**
 * Two things an admin sends from a thread to help an owner get set up: the box
 * for the SDMS and IRAS logins, and one of the short guide videos (installing the
 * app, how it works, adding the manager, papers, the density register, Kavach
 * photos). The buttons only open their dialogs; the dialogs live in the inbox
 * page, which the mobile Actions sheet shares.
 */
export function OutletHelpCard({ onAskLogin, onSendVideo }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Help the owner get set up</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button variant="secondary" size="sm" className="w-full" onClick={onAskLogin}>
          <KeyRound width={14} height={14} strokeWidth={1.75} aria-hidden />
          Ask for portal login
        </Button>
        <Button variant="secondary" size="sm" className="w-full" onClick={onSendVideo}>
          <Video width={14} height={14} strokeWidth={1.75} aria-hidden />
          Send a video
        </Button>
      </CardContent>
    </Card>
  );
}
