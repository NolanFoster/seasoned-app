interface StoredChallenge {
  challenge: string;
  flow: 'registration' | 'authentication';
  userId: string;
  expiresAt: number;
}

/**
 * Durable Objects serialize requests for a single state id. Keeping the
 * challenge in object storage makes the read-and-delete claim one-time even
 * when two completion requests arrive concurrently.
 */
export class PasskeyChallengeObject {
  private claimInProgress = false;

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/store') {
      const challenge = await request.json() as StoredChallenge;
      if (!challenge || typeof challenge.challenge !== 'string' ||
          !['registration', 'authentication'].includes(challenge.flow) ||
          typeof challenge.userId !== 'string' || !Number.isFinite(challenge.expiresAt)) {
        return Response.json({ success: false }, { status: 400 });
      }
      await this.state.storage.put('challenge', challenge);
      return Response.json({ success: true });
    }

    if (request.method === 'POST' && url.pathname === '/claim') {
      if (this.claimInProgress) return Response.json({ success: false }, { status: 404 });
      this.claimInProgress = true;
      try {
        const challenge = await this.state.storage.get<StoredChallenge>('challenge');
        if (!challenge || challenge.expiresAt <= Date.now()) {
          await this.state.storage.delete('challenge');
          return Response.json({ success: false }, { status: 404 });
        }
        await this.state.storage.delete('challenge');
        return Response.json({ success: true, data: challenge });
      } finally {
        this.claimInProgress = false;
      }
    }

    return Response.json({ success: false }, { status: 404 });
  }
}
