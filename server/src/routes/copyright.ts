import { Router, Request, Response } from 'express';
import { mcpClient } from '../integrations/mcp/ParallelMCPClient.js';

export const copyrightRouter = Router();

/**
 * POST /api/audio/copyright-verify — similarity check of script text against
 * published works found on the web.
 *
 * Audio fingerprinting is not implemented, so audio-only requests are
 * reported as unverified. No fingerprint hash or C2PA signature is returned:
 * none is computed.
 */
copyrightRouter.post('/copyright-verify', async (req: Request, res: Response) => {
  const { audioUrl, text } = req.body || {};
  if (!text && !audioUrl) {
    return res.status(400).json({ code: 400, data: null, message: 'text or audioUrl is required', error: 'INVALID_PAYLOAD' });
  }

  try {
    const result = await mcpClient.checkCopyrightSafety(text || '', text ? 'script' : 'audio');
    const status = !result.verified ? 'unverified' : result.safe ? 'no_matches_found' : 'possible_matches';

    return res.json({
      code: 200,
      data: {
        audioUrl: audioUrl || null,
        status,
        // Only a completed check with no matches counts as cleared — and even then it is
        // a similarity search, not legal clearance.
        cleared: result.verified && result.safe,
        copyrightMatches: result.issues,
        sources: result.sources,
      },
      message:
        status === 'unverified'
          ? text
            ? 'The copyright check could not be completed. Try again later.'
            : 'Audio fingerprinting is not available; provide the script text to run a similarity check.'
          : status === 'no_matches_found'
            ? 'No similar published works were found. This is a similarity search, not legal clearance.'
            : 'Possible similarities with published works were found. Review them before publishing.',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: 'Failed to verify copyright', error: err.message });
  }
});
