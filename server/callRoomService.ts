import {Response} from 'express';

export interface CallParticipant {
  peerId: string;
  groupId: string;
  name: string;
  role: string;
  isMuted: boolean;
  joinedAt: string;
}

interface RoomPeerEntry {
  participant: CallParticipant;
  res: Response;
  heartbeat: NodeJS.Timeout;
}

class CallRoomService {
  private rooms = new Map<string, Map<string, RoomPeerEntry>>();

  private getRoom(groupId: string): Map<string, RoomPeerEntry> {
    let room = this.rooms.get(groupId);
    if (!room) {
      room = new Map<string, RoomPeerEntry>();
      this.rooms.set(groupId, room);
    }
    return room;
  }

  private sendEvent(res: Response, event: string, data: unknown): void {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Ignore closed stream writes
    }
  }

  public getParticipants(groupId: string): CallParticipant[] {
    const room = this.rooms.get(groupId);
    if (!room) return [];
    return Array.from(room.values()).map((entry) => entry.participant);
  }

  public joinPeer(
    groupId: string,
    peer: {peerId: string; name: string; role: string; isMuted?: boolean},
    res: Response,
  ): void {
    const room = this.getRoom(groupId);

    // Close existing stale connection for same peerId if reconnecting
    const existing = room.get(peer.peerId);
    if (existing) {
      clearInterval(existing.heartbeat);
      try {
        existing.res.end();
      } catch {
        // ignore
      }
      room.delete(peer.peerId);
    }

    const participant: CallParticipant = {
      peerId: peer.peerId,
      groupId,
      name: peer.name,
      role: peer.role,
      isMuted: Boolean(peer.isMuted),
      joinedAt: new Date().toISOString(),
    };

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        this.leavePeer(groupId, peer.peerId);
      }
    }, 20000);

    room.set(peer.peerId, {participant, res, heartbeat});

    // Notify newcomer of full room state
    this.sendEvent(res, 'room-state', {
      groupId,
      participants: this.getParticipants(groupId),
    });

    // Notify existing peers about newcomer
    for (const [otherId, entry] of room.entries()) {
      if (otherId !== peer.peerId) {
        this.sendEvent(entry.res, 'peer-joined', {
          participant,
          participants: this.getParticipants(groupId),
        });
      }
    }
  }

  public leavePeer(groupId: string, peerId: string): void {
    const room = this.rooms.get(groupId);
    if (!room) return;
    const entry = room.get(peerId);
    if (entry) {
      clearInterval(entry.heartbeat);
      room.delete(peerId);
      const participants = this.getParticipants(groupId);
      for (const other of room.values()) {
        this.sendEvent(other.res, 'peer-left', {
          peerId,
          participants,
        });
      }
    }
    if (room.size === 0) {
      this.rooms.delete(groupId);
    }
  }

  public relaySignal(input: {
    groupId: string;
    fromPeerId: string;
    toPeerId?: string;
    type: 'offer' | 'answer' | 'ice' | 'mic-state' | 'ring';
    payload: unknown;
  }): {delivered: number} {
    const room = this.rooms.get(input.groupId);
    if (!room) return {delivered: 0};

    if (input.type === 'mic-state') {
      const sender = room.get(input.fromPeerId);
      if (sender && input.payload && typeof input.payload === 'object') {
        const p = input.payload as {isMuted?: boolean};
        if (typeof p.isMuted === 'boolean') {
          sender.participant.isMuted = p.isMuted;
        }
      }
    }

    let delivered = 0;
    if (input.toPeerId) {
      const target = room.get(input.toPeerId);
      if (target) {
        this.sendEvent(target.res, 'signal', {
          fromPeerId: input.fromPeerId,
          type: input.type,
          payload: input.payload,
        });
        delivered = 1;
      }
    } else {
      for (const [peerId, entry] of room.entries()) {
        if (peerId !== input.fromPeerId) {
          this.sendEvent(entry.res, 'signal', {
            fromPeerId: input.fromPeerId,
            type: input.type,
            payload: input.payload,
          });
          delivered += 1;
        }
      }
    }
    return {delivered};
  }
}

export const callRoomService = new CallRoomService();
