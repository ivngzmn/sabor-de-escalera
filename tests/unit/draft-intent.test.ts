import { expect, test } from "vitest";
import {
  hasContent,
  hasUnsavedWork,
  leaveTarget,
} from "../../src/features/recipes/draft-intent";
import { emptyRecipe } from "../../src/features/recipes/validation";

const here = "http://a.test/add-recipe?draft=1";
const plainClick = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};
const plainLink = {
  href: "/profile",
  target: "",
  download: false,
  hreflang: "",
};

test("hasContent is false for an empty recipe, ignoring language", () => {
  expect(hasContent(emptyRecipe())).toBe(false);
  expect(hasContent({ ...emptyRecipe(), language: "es" })).toBe(false);
});

test("hasContent is true once any field has content", () => {
  expect(hasContent({ ...emptyRecipe(), title: "x" })).toBe(true);
  expect(
    hasContent({
      ...emptyRecipe(),
      ingredients: [
        {
          kind: "ingredient",
          quantity: "1",
          unit: "",
          name: "salt",
          notes: "",
        },
      ],
    }),
  ).toBe(true);
});

test("hasUnsavedWork respects stopped and draft state", () => {
  const empty = emptyRecipe();
  const titled = { ...emptyRecipe(), title: "x" };
  expect(
    hasUnsavedWork({
      stopped: true,
      hasDraft: false,
      current: titled,
      saved: null,
    }),
  ).toBe(false);
  expect(
    hasUnsavedWork({
      stopped: false,
      hasDraft: false,
      current: empty,
      saved: null,
    }),
  ).toBe(false);
  expect(
    hasUnsavedWork({
      stopped: false,
      hasDraft: false,
      current: titled,
      saved: null,
    }),
  ).toBe(true);
  expect(
    hasUnsavedWork({
      stopped: false,
      hasDraft: true,
      current: titled,
      saved: titled,
    }),
  ).toBe(false);
  expect(
    hasUnsavedWork({
      stopped: false,
      hasDraft: true,
      current: { ...titled, title: "y" },
      saved: titled,
    }),
  ).toBe(true);
});

test("leaveTarget intercepts a plain same-origin left click", () => {
  expect(leaveTarget(plainClick, plainLink, here)).toBe(
    "http://a.test/profile",
  );
});

test("leaveTarget ignores non-primary buttons and modified clicks", () => {
  expect(leaveTarget({ ...plainClick, button: 1 }, plainLink, here)).toBeNull();
  expect(
    leaveTarget({ ...plainClick, metaKey: true }, plainLink, here),
  ).toBeNull();
  expect(
    leaveTarget({ ...plainClick, ctrlKey: true }, plainLink, here),
  ).toBeNull();
  expect(
    leaveTarget({ ...plainClick, shiftKey: true }, plainLink, here),
  ).toBeNull();
  expect(
    leaveTarget({ ...plainClick, altKey: true }, plainLink, here),
  ).toBeNull();
});

test("leaveTarget ignores already-handled clicks", () => {
  expect(
    leaveTarget({ ...plainClick, defaultPrevented: true }, plainLink, here),
  ).toBeNull();
});

test("leaveTarget ignores links that open elsewhere, download or set hreflang", () => {
  expect(
    leaveTarget(plainClick, { ...plainLink, target: "_blank" }, here),
  ).toBeNull();
  expect(
    leaveTarget(plainClick, { ...plainLink, download: true }, here),
  ).toBeNull();
  expect(
    leaveTarget(plainClick, { ...plainLink, hreflang: "es" }, here),
  ).toBeNull();
});

test("leaveTarget ignores other origins", () => {
  expect(
    leaveTarget(
      plainClick,
      { ...plainLink, href: "https://other.test/x" },
      here,
    ),
  ).toBeNull();
});

test("leaveTarget ignores same-page hash links", () => {
  expect(
    leaveTarget(
      plainClick,
      { ...plainLink, href: "http://a.test/add-recipe?draft=1#step" },
      here,
    ),
  ).toBeNull();
});

test("leaveTarget ignores non-http(s) protocols", () => {
  expect(
    leaveTarget(plainClick, { ...plainLink, href: "mailto:x@y.z" }, here),
  ).toBeNull();
  expect(
    leaveTarget(plainClick, { ...plainLink, href: "tel:+15555550100" }, here),
  ).toBeNull();
  expect(
    leaveTarget(plainClick, { ...plainLink, href: "javascript:void(0)" }, here),
  ).toBeNull();
});
