import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MemberAvatar } from "../../src/features/accounts/MemberAvatar";

const id = "11111111-1111-4111-8111-111111111111";
const asset = "22222222-2222-4222-8222-222222222222";

test("an uploaded photo is in the server HTML, with no preset underneath to flash", () => {
  const html = renderToStaticMarkup(<MemberAvatar memberId={id} displayName="Ivan Guzman" avatarAssetId={asset} avatarPreset="chile" />);
  expect(html).toContain(`src="/api/members/${id}/avatar?v=${asset}"`);
  expect(html).not.toContain("🌶️");
});

test("without a photo the preset or initials show", () => {
  expect(renderToStaticMarkup(<MemberAvatar memberId={id} displayName="Ivan Guzman" avatarPreset="chile" />)).toContain("🌶️");
  expect(renderToStaticMarkup(<MemberAvatar memberId={id} displayName="Ivan Guzman" />)).toContain("IG");
});
