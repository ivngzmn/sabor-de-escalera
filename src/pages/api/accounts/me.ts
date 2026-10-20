import type { APIRoute } from 'astro';
import { accounts } from '../../../features/accounts/service';
import { accountFailure, privateHeaders } from '../../../features/accounts/routes';
// Header identity for client islands; public pages stay free of per-member markup.
export const GET: APIRoute = async ({ request }) => {
  try {
    const actor = await accounts().requireActor(request);
    return Response.json({ id: actor.id, role: actor.role, onboarded: actor.onboarded, displayName: actor.displayName, avatarAssetId: actor.avatarAssetId ?? null, avatarPreset: actor.avatarPreset }, { headers: privateHeaders });
  } catch (error) { return accountFailure(error); }
};
