import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import type { Actor } from '../features/accounts/permissions';
import type { PhotoCreditInput } from '../features/cookbook/corrections';
import type { QueueFilter, QueueRow } from '../features/cookbook/queue';
import type { AssetRef, Purpose, Result as MediaResult, UploadIntent } from '../features/media/contracts';
import type { CatalogPage, CatalogQuery, PhotoCredit, PublicMember, RecipeCard } from '../features/recipes/catalog';
import { nextSlug } from '../features/recipes/drafts';
import { searchKey } from '../features/recipes/search-key';
import type { TranslatableText } from '../features/recipes/translation-text';
import {
  categories,
  emptyRecipe,
  isId,
  totalMinutes,
  validateDraft,
  validatePublication,
  type Draft,
  type Origin,
  type RecipeInput,
  type Result,
} from '../features/recipes/validation';
import type { HeaderIdentity } from './header-identity';

const runtimeEnv = (): Readonly<Record<string, string | undefined>> => ({
  ...(import.meta.env ?? {}),
  ...process.env,
});

export function isPreviewMode(): boolean {
  const env = runtimeEnv();
  return !env.DATABASE_URL;
}

export const PREVIEW_OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_MATEO_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_LUCIA_ID = '33333333-3333-4333-8333-333333333333';

const ASSET_IDS = {
  birria: 'aaaaaaaa-1111-4111-8111-111111111111',
  arroz: 'aaaaaaaa-2222-4222-8222-222222222222',
  pupusas: 'aaaaaaaa-3333-4333-8333-333333333333',
  ceviche: 'aaaaaaaa-4444-4444-8444-444444444444',
  alfajores: 'aaaaaaaa-5555-4555-8555-555555555555',
} as const;

const ASSET_FILES: Record<string, string> = {
  [ASSET_IDS.birria]: 'recipe_birria_bowl_1794800299590.jpg',
  [ASSET_IDS.arroz]: 'recipe_arroz_gandules_1794800298212.jpg',
  [ASSET_IDS.pupusas]: 'recipe_pupusas_griddle_1794800299871.jpg',
  [ASSET_IDS.ceviche]: 'recipe_ceviche_bowl_1794800300496.jpg',
  [ASSET_IDS.alfajores]: 'recipe_alfajores_plate_1794800301371.jpg',
};

const PHOTO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  [ASSET_IDS.birria]: { width: 1408, height: 792 },
  [ASSET_IDS.arroz]: { width: 1280, height: 960 },
  [ASSET_IDS.pupusas]: { width: 1280, height: 960 },
  [ASSET_IDS.ceviche]: { width: 1280, height: 960 },
  [ASSET_IDS.alfajores]: { width: 1280, height: 960 },
};

const KEY_TO_ASSET: Record<string, string> = {
  'example-birria': ASSET_IDS.birria,
  'example-arroz-con-gandules': ASSET_IDS.arroz,
  'example-pastelon': ASSET_IDS.birria,
  'example-chuchitos': ASSET_IDS.arroz,
  'example-mole-negro': ASSET_IDS.birria,
  'example-pupusas': ASSET_IDS.pupusas,
  'example-arepas': ASSET_IDS.pupusas,
  'example-empanadas': ASSET_IDS.pupusas,
  'example-ceviche': ASSET_IDS.ceviche,
  'example-alfajores': ASSET_IDS.alfajores,
};

const KEY_TO_RECIPE_ID: Record<string, string> = {
  'example-birria': 'bbbbbbbb-0001-4000-8000-000000000001',
  'example-arroz-con-gandules': 'bbbbbbbb-0002-4000-8000-000000000002',
  'example-pastelon': 'bbbbbbbb-0003-4000-8000-000000000003',
  'example-chuchitos': 'bbbbbbbb-0004-4000-8000-000000000004',
  'example-mole-negro': 'bbbbbbbb-0005-4000-8000-000000000005',
  'example-pupusas': 'bbbbbbbb-0006-4000-8000-000000000006',
  'example-arepas': 'bbbbbbbb-0007-4000-8000-000000000007',
  'example-empanadas': 'bbbbbbbb-0008-4000-8000-000000000008',
  'example-ceviche': 'bbbbbbbb-0009-4000-8000-000000000009',
  'example-alfajores': 'bbbbbbbb-0010-4000-8000-000000000010',
  'example-jamaica': 'bbbbbbbb-0011-4000-8000-000000000011',
  'example-draft': 'bbbbbbbb-0012-4000-8000-000000000012',
};

interface ExampleRecipeJson {
  origins: [string, string, string][];
  recipes: {
    key: string;
    language: 'en' | 'es';
    flags: string[];
    sourceUrls?: string[];
    title: string;
    category: string;
    origin: string;
    yieldText: string;
    baseline: number;
    dietary?: string[];
    timing: { mode: 'total' | 'parts'; total: number | null; prep: number | null; cook: number | null; rest: number | null };
    story: string;
    ingredients: (string | [string, string, string])[];
    steps: string[];
    photos: [string, string][];
  }[];
}

interface StoredRecipe {
  id: string;
  ownerId: string | null;
  state: 'draft' | 'published' | 'unpublished' | 'deleted';
  version: number;
  generation: number;
  slug: string | null;
  input: RecipeInput;
  createdAt: string;
  updatedAt: string;
  firstPublishedAt: string | null;
  deletedAt: string | null;
}

interface StoredTranslation {
  id: string;
  recipeId: string;
  language: 'en' | 'es';
  sourceVersion: number;
  status: 'proposed' | 'approved' | 'outdated';
  input: TranslatableText;
  updatedAt: string;
}

interface StoredCookbookEntry {
  entryId: string;
  recipeId: string;
  key: string;
  pages: number[];
  contributor: string | null;
  originalAuthor: string | null;
  flags: string[];
  sourceUrls: string[];
  sourceClearance: string | null;
  textReview: 'pending' | 'approved';
  imageReview: 'missing' | 'pending' | 'approved';
}

interface StoredCredit {
  kind: 'owner' | 'stock' | 'ai';
  photographer: string;
  sourceUrl: string;
  license: string;
  retrievedOn: string;
  cropping: string;
}

interface StoredAsset {
  id: string;
  ownerId: string;
  purpose: Purpose;
  width: number;
  height: number;
  filePath?: string;
  rawBytes?: Buffer;
}

interface PreviewState {
  members: Map<string, Actor & { verifiedEmail: string }>;
  origins: Origin[];
  recipes: Map<string, StoredRecipe>;
  favorites: Map<string, Set<string>>;
  translations: StoredTranslation[];
  cookbookEntries: Map<string, StoredCookbookEntry>;
  photoCredits: Map<string, StoredCredit>;
  assets: Map<string, StoredAsset>;
  uploadIntents: Map<string, { id: string; ownerId: string; purpose: Purpose; bytes?: Buffer }>;
  invitations: { id: string; email: string; expires_at: Date }[];
  audit: { id: string; action: string; actor_id: string; target_id: string; created_at: Date; actor_name: string | null; target_name: string | null }[];
  bufferCache: Map<string, Buffer>;
}

const COUNTRY_CODES: Record<string, string | null> = {
  argentina: 'AR',
  'el-salvador': 'SV',
  guatemala: 'GT',
  mexico: 'MX',
  peru: 'PE',
  'puerto-rico': 'PR',
  venezuela: 'VE',
  fusion: null,
  'not-sure': null,
};

function convertExampleInput(r: ExampleRecipeJson['recipes'][number]): RecipeInput {
  const assetId = KEY_TO_ASSET[r.key] ?? ASSET_IDS.birria;
  const dims = PHOTO_DIMENSIONS[assetId] ?? { width: 1280, height: 960 };
  return {
    title: r.title,
    category: r.category,
    origin: r.origin,
    yieldText: r.yieldText,
    baseline: r.baseline,
    baselineConfirmed: true,
    timing: { ...r.timing },
    story: r.story,
    sourceCredit: r.flags.includes('third-party-source') ? 'Adapted from community culinary archive' : '',
    videoUrl: '',
    notes: r.flags.includes('quantity-check:4')
      ? 'Check ingredient 4 quantity against the hand-written notebook.'
      : '',
    language: r.language,
    dietary: r.dietary ?? [],
    photos: [
      {
        assetId,
        caption: r.photos[0]?.[1] ?? r.title,
        alt: r.photos[0]?.[1] ?? r.title,
        crop: { x: 50, y: 50, zoom: 1 },
        width: dims.width,
        height: dims.height,
      },
    ],
    ingredients: r.ingredients.map((row) =>
      typeof row === 'string'
        ? { kind: 'section', quantity: '', unit: '', name: row.replace(/^#\s*/, ''), notes: '' }
        : { kind: 'ingredient', quantity: row[0], unit: row[1], name: row[2], notes: '' },
    ),
    instructions: r.steps.map((text) => ({ kind: 'step', text })),
  };
}

function createInitialState(): PreviewState {
  const raw = readFileSync(resolve(process.cwd(), 'scripts/example-recipes.json'), 'utf8');
  const parsed = JSON.parse(raw) as ExampleRecipeJson;

  const origins: Origin[] = [
    ...parsed.origins.map(([id, label_en, label_es]) => ({
      id,
      label_en,
      label_es,
      country_code: COUNTRY_CODES[id] ?? null,
    })),
    { id: 'fusion', label_en: 'Fusion', label_es: 'Fusión', country_code: null },
    { id: 'not-sure', label_en: 'Not sure', label_es: 'No estoy seguro', country_code: null },
  ];

  const members = new Map<string, Actor & { verifiedEmail: string }>([
    [
      PREVIEW_OWNER_ID,
      {
        id: PREVIEW_OWNER_ID,
        role: 'owner',
        suspended: false,
        onboarded: true,
        displayName: 'Elena Morales',
        bio: 'Cooking heirloom dishes passed down from Oaxaca and San Juan.',
        avatarAssetId: null,
        avatarPreset: 'lime',
        savedListPublic: true,
        memberSince: '2025-03-14T16:00:00.000Z',
        verifiedEmail: 'elena@escalera.example',
      },
    ],
    [
      MEMBER_MATEO_ID,
      {
        id: MEMBER_MATEO_ID,
        role: 'member',
        suspended: false,
        onboarded: true,
        displayName: 'Mateo Silva',
        bio: 'Slow-simmered sauces, street-corner antojitos, and Sunday bread.',
        avatarAssetId: null,
        avatarPreset: 'chile',
        savedListPublic: true,
        memberSince: '2025-05-02T12:00:00.000Z',
        verifiedEmail: 'mateo@escalera.example',
      },
    ],
    [
      MEMBER_LUCIA_ID,
      {
        id: MEMBER_LUCIA_ID,
        role: 'admin',
        suspended: false,
        onboarded: true,
        displayName: 'Lucía Ramírez',
        bio: 'Documenting coastal and mountain kitchen traditions in English and Spanish.',
        avatarAssetId: null,
        avatarPreset: 'corn',
        savedListPublic: true,
        memberSince: '2025-04-10T18:30:00.000Z',
        verifiedEmail: 'lucia@escalera.example',
      },
    ],
  ]);

  const assets = new Map<string, StoredAsset>();
  for (const [id, file] of Object.entries(ASSET_FILES)) {
    const dims = PHOTO_DIMENSIONS[id] ?? { width: 1280, height: 960 };
    assets.set(id, {
      id,
      ownerId: PREVIEW_OWNER_ID,
      purpose: 'recipe',
      width: dims.width,
      height: dims.height,
      filePath: resolve(process.cwd(), 'src/assets/images', file),
    });
  }

  const recipes = new Map<string, StoredRecipe>();
  const ownerMap: Record<string, string | null> = {
    'example-birria': PREVIEW_OWNER_ID,
    'example-arroz-con-gandules': MEMBER_MATEO_ID,
    'example-pastelon': PREVIEW_OWNER_ID,
    'example-chuchitos': MEMBER_MATEO_ID,
    'example-mole-negro': MEMBER_MATEO_ID,
    'example-pupusas': MEMBER_LUCIA_ID,
    'example-arepas': PREVIEW_OWNER_ID,
    'example-empanadas': null,
    'example-ceviche': null,
    'example-alfajores': MEMBER_LUCIA_ID,
  };

  let timestampOffset = 0;
  for (const r of parsed.recipes) {
    const id = KEY_TO_RECIPE_ID[r.key];
    const isQueued = r.key === 'example-empanadas' || r.key === 'example-ceviche';
    const input = convertExampleInput(r);
    // Give Birria 2 additional photos so gallery thumbnails showcase multi-photo recipe view
    if (r.key === 'example-birria') {
      input.photos.push(
        {
          assetId: ASSET_IDS.arroz,
          caption: 'Warm clay dish pairings for Sunday supper',
          alt: 'Clay dish serving alongside the stew',
          crop: { x: 50, y: 50, zoom: 1 },
          width: PHOTO_DIMENSIONS[ASSET_IDS.arroz].width,
          height: PHOTO_DIMENSIONS[ASSET_IDS.arroz].height,
        },
        {
          assetId: ASSET_IDS.pupusas,
          caption: 'Hand-pressed tortillas and griddle classics on the table',
          alt: 'Warm corn cakes browning on a griddle',
          crop: { x: 50, y: 50, zoom: 1 },
          width: PHOTO_DIMENSIONS[ASSET_IDS.pupusas].width,
          height: PHOTO_DIMENSIONS[ASSET_IDS.pupusas].height,
        },
      );
    }
    const baseTime = new Date(Date.UTC(2026, 9, 10 - timestampOffset, 15, 0, 0)).toISOString();
    timestampOffset++;
    recipes.set(id, {
      id,
      ownerId: ownerMap[r.key] ?? PREVIEW_OWNER_ID,
      state: isQueued ? 'draft' : 'published',
      version: 1,
      generation: 1,
      slug: isQueued ? null : nextSlug(null, input.title, null, new Date(baseTime)),
      input,
      createdAt: baseTime,
      updatedAt: baseTime,
      firstPublishedAt: isQueued ? null : baseTime,
      deletedAt: null,
    });
  }

  // Add a quick vegan beverage recipe so Under 30m, Vegan, and Beverages filters all shine
  const jamaicaId = KEY_TO_RECIPE_ID['example-jamaica'];
  recipes.set(jamaicaId, {
    id: jamaicaId,
    ownerId: PREVIEW_OWNER_ID,
    state: 'published',
    version: 1,
    generation: 1,
    slug: 'agua-de-jamaica-con-jengibre',
    input: {
      title: 'Agua de Jamaica con Jengibre',
      category: 'beverages',
      origin: 'mexico',
      yieldText: '6 glasses',
      baseline: 6,
      baselineConfirmed: true,
      timing: { mode: 'total', total: 20, prep: null, cook: null, rest: null },
      story: 'Crisp ruby hibiscus steep with fresh ginger and lime—chilled in minutes for hot afternoon meals.',
      sourceCredit: '',
      videoUrl: '',
      notes: 'Sweeten lightly with piloncillo or cane sugar while still warm.',
      language: 'en',
      dietary: ['vegan', 'vegetarian'],
      photos: [
        {
          assetId: ASSET_IDS.ceviche,
          caption: 'Bright citrus and chilled market ingredients ready for the pitcher',
          alt: 'Fresh citrus and vibrant ingredients prepared in a ceramic bowl',
          crop: { x: 50, y: 50, zoom: 1 },
          width: PHOTO_DIMENSIONS[ASSET_IDS.ceviche].width,
          height: PHOTO_DIMENSIONS[ASSET_IDS.ceviche].height,
        },
      ],
      ingredients: [
        { kind: 'ingredient', quantity: '1', unit: 'cup', name: 'dried hibiscus flowers (flor de jamaica)', notes: 'rinsed lightly' },
        { kind: 'ingredient', quantity: '4', unit: 'slices', name: 'fresh ginger', notes: '' },
        { kind: 'ingredient', quantity: '6', unit: 'cups', name: 'water, divided', notes: '' },
        { kind: 'ingredient', quantity: '1/3', unit: 'cup', name: 'cane sugar or piloncillo', notes: 'to taste' },
        { kind: 'ingredient', quantity: '1', unit: '', name: 'lime, juiced', notes: '' },
      ],
      instructions: [
        { kind: 'step', text: 'Bring 2 cups of water to a boil, then remove from heat and add the hibiscus and sliced ginger.' },
        { kind: 'step', text: 'Steep for 10 minutes until deep crimson, then stir in the sugar until dissolved.' },
        { kind: 'step', text: 'Strain into a pitcher with the remaining 4 cups of cold water and fresh lime juice.' },
        { kind: 'step', text: 'Serve over plenty of ice with a wedge of lime.' },
      ],
    },
    createdAt: '2026-10-12T18:00:00.000Z',
    updatedAt: '2026-10-12T18:00:00.000Z',
    firstPublishedAt: '2026-10-12T18:00:00.000Z',
    deletedAt: null,
  });

  // Add a work-in-progress draft for Elena Morales
  const draftId = KEY_TO_RECIPE_ID['example-draft'];
  recipes.set(draftId, {
    id: draftId,
    ownerId: PREVIEW_OWNER_ID,
    state: 'draft',
    version: 2,
    generation: 1,
    slug: null,
    input: {
      ...emptyRecipe(),
      title: 'Sopa Azteca de Tortilla',
      category: 'main',
      origin: 'mexico',
      yieldText: '4 bowls',
      baseline: 4,
      baselineConfirmed: true,
      timing: { mode: 'parts', total: null, prep: 15, cook: 30, rest: null },
      story: 'Charred tomato and pasilla broth poured tableside over crisp tortilla strips and avocado.',
      language: 'en',
      dietary: ['vegetarian'],
      photos: [
        {
          assetId: ASSET_IDS.birria,
          caption: 'Rich roasted-chile broth ready for crispy tortilla strips',
          alt: 'Rich chile broth in a dark clay bowl',
          crop: { x: 50, y: 50, zoom: 1 },
          width: PHOTO_DIMENSIONS[ASSET_IDS.birria].width,
          height: PHOTO_DIMENSIONS[ASSET_IDS.birria].height,
        },
      ],
      ingredients: [
        { kind: 'ingredient', quantity: '4', unit: '', name: 'plum tomatoes, halved', notes: '' },
        { kind: 'ingredient', quantity: '1', unit: '', name: 'dried pasilla chile', notes: 'seeded' },
        { kind: 'ingredient', quantity: '4', unit: 'cups', name: 'vegetable broth', notes: '' },
      ],
      instructions: [
        { kind: 'step', text: 'Char the tomatoes, onion, and garlic on a dry comal until blistered.' },
        { kind: 'step', text: 'Blend smooth with the toasted pasilla chile and simmer in warm broth.' },
      ],
    },
    createdAt: '2026-10-14T11:00:00.000Z',
    updatedAt: '2026-10-14T12:15:00.000Z',
    firstPublishedAt: null,
    deletedAt: null,
  });

  const favorites = new Map<string, Set<string>>([
    [
      PREVIEW_OWNER_ID,
      new Set([
        KEY_TO_RECIPE_ID['example-arroz-con-gandules'],
        KEY_TO_RECIPE_ID['example-pupusas'],
        KEY_TO_RECIPE_ID['example-alfajores'],
      ]),
    ],
    [
      MEMBER_MATEO_ID,
      new Set([KEY_TO_RECIPE_ID['example-birria'], KEY_TO_RECIPE_ID['example-arroz-con-gandules']]),
    ],
    [
      MEMBER_LUCIA_ID,
      new Set([KEY_TO_RECIPE_ID['example-birria'], KEY_TO_RECIPE_ID['example-pupusas']]),
    ],
  ]);

  const translations: StoredTranslation[] = [
    {
      id: 'cccccccc-0001-4000-8000-000000000001',
      recipeId: KEY_TO_RECIPE_ID['example-chuchitos'],
      language: 'en',
      sourceVersion: 1,
      status: 'approved',
      updatedAt: '2026-10-08T10:00:00.000Z',
      input: {
        title: 'Guatemalan Chuchitos',
        story: 'Steamed corn masa bundles filled with tender chicken and roasted tomato recado.',
        notes: '',
        yieldText: '12 chuchitos',
        ingredients: [
          { name: 'corn masa', unit: 'cups', notes: '' },
          { name: 'lard or shortening', unit: 'cup', notes: '' },
          { name: 'chicken broth', unit: 'cups', notes: '' },
          { name: 'shredded cooked chicken', unit: 'cups', notes: '' },
          { name: 'tomato recado sauce', unit: 'cup', notes: '' },
          { name: 'soaked corn husks', unit: '', notes: '' },
        ],
        instructions: [
          { text: 'Mix the masa with the lard and warm broth until smooth and pillowy.' },
          { text: 'Spread a spoonful of masa on each husk and top with chicken and recado.' },
          { text: 'Wrap tightly and tie both ends with strips of corn husk.' },
          { text: 'Steam for one hour, then rest 10 minutes before unwrapping.' },
        ],
        captions: ['Chuchitos wrapped in corn husks over woven textiles'],
      },
    },
    {
      id: 'cccccccc-0002-4000-8000-000000000002',
      recipeId: KEY_TO_RECIPE_ID['example-arroz-con-gandules'],
      language: 'es',
      sourceVersion: 1,
      status: 'approved',
      updatedAt: '2026-10-09T10:00:00.000Z',
      input: {
        title: 'Arroz con Gandules',
        story: 'Clásico arroz puertorriqueño cocido en caldero con sofrito, aceitunas y gandules.',
        notes: '',
        yieldText: '6 porciones',
        ingredients: [
          { name: 'aceite', unit: 'cdas', notes: '' },
          { name: 'sofrito', unit: 'taza', notes: '' },
          { name: 'arroz grano mediano', unit: 'tazas', notes: '' },
          { name: 'gandules escurridos', unit: 'lata', notes: '' },
          { name: 'caldo de pollo', unit: 'tazas', notes: '' },
          { name: 'aceitunas verdes', unit: 'taza', notes: '' },
          { name: 'sal', unit: 'cdta', notes: '' },
        ],
        instructions: [
          { text: 'Calienta el aceite en un caldero y sofríe el sofrito durante 3 minutos.' },
          { text: 'Agrega el arroz para cubrirlo bien y añade los gandules, las aceitunas, la sal y el caldo.' },
          { text: 'Deja hervir, tapa bien y cocina a fuego lento hasta que el arroz esté tierno, unos 25 minutos.' },
          { text: 'Esponja con un tenedor y sirve caliente.' },
        ],
        captions: ['Arroz con gandules servido en caldero tradicional'],
      },
    },
    {
      id: 'cccccccc-0003-4000-8000-000000000003',
      recipeId: KEY_TO_RECIPE_ID['example-mole-negro'],
      language: 'en',
      sourceVersion: 1,
      status: 'proposed',
      updatedAt: '2026-10-13T14:00:00.000Z',
      input: {
        title: 'Chicken in Black Mole',
        story: 'Velvety roasted mulato and pasilla chile sauce enriched with almonds and Mexican chocolate.',
        notes: '',
        yieldText: '6 servings',
        ingredients: [
          { name: 'chicken pieces', unit: '', notes: '' },
          { name: 'mulato chiles', unit: '', notes: '' },
          { name: 'pasilla chiles', unit: '', notes: '' },
          { name: 'almonds', unit: 'cup', notes: '' },
          { name: 'Mexican chocolate', unit: 'g', notes: '' },
          { name: 'chicken broth', unit: 'cups', notes: '' },
          { name: 'salt to taste', unit: '', notes: '' },
        ],
        instructions: [
          { text: 'Simmer the chicken in salted water until tender and reserve the broth.' },
          { text: 'Toast the chiles and almonds, then soak them in hot broth until pliable.' },
          { text: 'Blend thoroughly until silky smooth.' },
          { text: 'Simmer the sauce gently, stir in the chocolate, and cook until thickened.' },
          { text: 'Spoon warm mole generously over the chicken to serve.' },
        ],
        captions: ['Chicken in dark mole served alongside rice on a clay platter'],
      },
    },
  ];

  const cookbookEntries = new Map<string, StoredCookbookEntry>([
    [
      'dddddddd-0001-4000-8000-000000000001',
      {
        entryId: 'dddddddd-0001-4000-8000-000000000001',
        recipeId: KEY_TO_RECIPE_ID['example-empanadas'],
        key: 'example-empanadas',
        pages: [42, 43],
        contributor: 'Familia Gómez',
        originalAuthor: 'Abuela Clara',
        flags: ['quantity-check:4'],
        sourceUrls: [],
        sourceClearance: null,
        textReview: 'pending',
        imageReview: 'pending',
      },
    ],
    [
      'dddddddd-0002-4000-8000-000000000002',
      {
        entryId: 'dddddddd-0002-4000-8000-000000000002',
        recipeId: KEY_TO_RECIPE_ID['example-ceviche'],
        key: 'example-ceviche',
        pages: [58],
        contributor: 'Taller Lima',
        originalAuthor: null,
        flags: ['third-party-source'],
        sourceUrls: ['https://example.com/sample-ceviche'],
        sourceClearance: null,
        textReview: 'approved',
        imageReview: 'approved',
      },
    ],
    [
      'dddddddd-0003-4000-8000-000000000003',
      {
        entryId: 'dddddddd-0003-4000-8000-000000000003',
        recipeId: KEY_TO_RECIPE_ID['example-arroz-con-gandules'],
        key: 'example-arroz-con-gandules',
        pages: [18],
        contributor: 'Tía Carmen',
        originalAuthor: 'Doña Carmen Vélez',
        flags: [],
        sourceUrls: [],
        sourceClearance: null,
        textReview: 'approved',
        imageReview: 'approved',
      },
    ],
    [
      'dddddddd-0004-4000-8000-000000000004',
      {
        entryId: 'dddddddd-0004-4000-8000-000000000004',
        recipeId: KEY_TO_RECIPE_ID['example-chuchitos'],
        key: 'example-chuchitos',
        pages: [24, 25],
        contributor: 'Familia Morales',
        originalAuthor: null,
        flags: [],
        sourceUrls: [],
        sourceClearance: null,
        textReview: 'approved',
        imageReview: 'approved',
      },
    ],
  ]);

  const photoCredits = new Map<string, StoredCredit>([
    [
      ASSET_IDS.birria,
      {
        kind: 'ai',
        photographer: 'Editorial Kitchen Studio',
        sourceUrl: '',
        license: 'Generated editorial dish illustration approved for Sabor de Escalera',
        retrievedOn: '2026-10-01',
        cropping: '16:9 centerpiece',
      },
    ],
    [
      ASSET_IDS.arroz,
      {
        kind: 'ai',
        photographer: 'Editorial Kitchen Studio',
        sourceUrl: '',
        license: 'Generated editorial dish illustration approved for Sabor de Escalera',
        retrievedOn: '2026-10-01',
        cropping: '4:3 overhead',
      },
    ],
    [
      ASSET_IDS.pupusas,
      {
        kind: 'ai',
        photographer: 'Editorial Kitchen Studio',
        sourceUrl: '',
        license: 'Generated editorial dish illustration approved for Sabor de Escalera',
        retrievedOn: '2026-10-01',
        cropping: '4:3 griddle close-up',
      },
    ],
    [
      ASSET_IDS.ceviche,
      {
        kind: 'ai',
        photographer: 'Editorial Kitchen Studio',
        sourceUrl: '',
        license: 'Generated editorial dish illustration approved for Sabor de Escalera',
        retrievedOn: '2026-10-01',
        cropping: '4:3 tabletop',
      },
    ],
    [
      ASSET_IDS.alfajores,
      {
        kind: 'ai',
        photographer: 'Editorial Kitchen Studio',
        sourceUrl: '',
        license: 'Generated editorial dish illustration approved for Sabor de Escalera',
        retrievedOn: '2026-10-01',
        cropping: '4:3 plate',
      },
    ],
  ]);

  return {
    members,
    origins,
    recipes,
    favorites,
    translations,
    cookbookEntries,
    photoCredits,
    assets,
    uploadIntents: new Map(),
    invitations: [],
    audit: [
      {
        id: 'eeeeeeee-0001-4000-8000-000000000001',
        action: 'owner_bootstrapped',
        actor_id: PREVIEW_OWNER_ID,
        target_id: PREVIEW_OWNER_ID,
        created_at: new Date('2025-03-14T16:00:00.000Z'),
        actor_name: 'Elena Morales',
        target_name: 'Elena Morales',
      },
      {
        id: 'eeeeeeee-0002-4000-8000-000000000002',
        action: 'admin_granted',
        actor_id: PREVIEW_OWNER_ID,
        target_id: MEMBER_LUCIA_ID,
        created_at: new Date('2025-04-12T10:00:00.000Z'),
        actor_name: 'Elena Morales',
        target_name: 'Lucía Ramírez',
      },
    ],
    bufferCache: new Map(),
  };
}

const g = globalThis as typeof globalThis & { __escaleraPreviewState?: PreviewState };

export function getPreviewState(): PreviewState {
  if (!g.__escaleraPreviewState) {
    g.__escaleraPreviewState = createInitialState();
  }
  return g.__escaleraPreviewState;
}

export function isPreviewSignedOut(request?: Request): boolean {
  if (!request) return false;
  const cookie = request.headers.get('cookie') ?? '';
  return /(?:^|;\s*)preview_session=signed_out(?:;|$)/.test(cookie);
}

export function previewActor(request?: Request): Actor | null {
  if (isPreviewSignedOut(request)) return null;
  const state = getPreviewState();
  return state.members.get(PREVIEW_OWNER_ID) ?? null;
}

export function previewHeaderIdentity(request: Request): HeaderIdentity | null {
  const actor = previewActor(request);
  if (!actor) return null;
  return {
    id: actor.id,
    role: actor.role,
    onboarded: actor.onboarded,
    displayName: actor.displayName,
    avatarPreset: actor.avatarPreset,
    avatarAssetId: actor.avatarAssetId ?? null,
  };
}

function recipeToDraft(r: StoredRecipe): Draft {
  return {
    id: r.id,
    ownerId: r.ownerId,
    version: r.version,
    generation: r.generation,
    label: r.input.title.trim() || 'Untitled recipe',
    input: structuredClone(r.input),
    state: r.state,
    url: r.slug ? `/recipes/${r.id}/${r.slug}` : null,
    updatedAt: r.updatedAt,
    publishedAt: r.firstPublishedAt,
  };
}

function approvedTranslationFor(recipe: StoredRecipe, language: 'en' | 'es'): TranslatableText | null {
  if (recipe.input.language === language) return null;
  const match = getPreviewState().translations.find(
    (t) => t.recipeId === recipe.id && t.language === language && t.status === 'approved',
  );
  return match ? structuredClone(match.input) : null;
}

function favoriteCountFor(recipeId: string): number {
  let count = 0;
  for (const set of getPreviewState().favorites.values()) {
    if (set.has(recipeId)) count++;
  }
  return count;
}

function buildSearchBlob(recipe: StoredRecipe): string {
  const trs = getPreviewState().translations.filter(
    (t) => t.recipeId === recipe.id && t.status === 'approved',
  );
  const parts = [
    recipe.input.title,
    ...trs.map((t) => t.input.title),
    ...recipe.input.ingredients.filter((i) => i.kind === 'ingredient').map((i) => i.name),
    ...trs.flatMap((t) => t.input.ingredients.map((i) => i.name)),
  ];
  return parts.map(searchKey).join('\n');
}

export const previewCatalogService = {
  async readerTranslation(recipeId: string, language: 'en' | 'es'): Promise<TranslatableText | null> {
    const r = getPreviewState().recipes.get(recipeId);
    if (!r) return null;
    return approvedTranslationFor(r, language);
  },
  async cookbookCredit(recipeId: string) {
    for (const entry of getPreviewState().cookbookEntries.values()) {
      if (entry.recipeId === recipeId) {
        return { contributor: entry.contributor, originalAuthor: entry.originalAuthor };
      }
    }
    return null;
  },
  async photoCredits(recipeId: string): Promise<Record<string, PhotoCredit>> {
    const r = getPreviewState().recipes.get(recipeId);
    if (!r || r.state !== 'published') return {};
    const out: Record<string, PhotoCredit> = {};
    for (const p of r.input.photos) {
      const credit = getPreviewState().photoCredits.get(p.assetId);
      if (credit) {
        out[p.assetId] = {
          kind: credit.kind,
          photographer: credit.photographer || null,
          site: credit.sourceUrl.includes('pexels.com')
            ? 'Pexels'
            : credit.sourceUrl.includes('unsplash.com')
              ? 'Unsplash'
              : null,
          label: credit.kind === 'owner' ? 'none' : credit.kind === 'stock' ? 'illustrative' : 'ai-illustrative',
        };
      }
    }
    return out;
  },
  async authorName(memberId: string | null): Promise<string | null> {
    if (!memberId) return null;
    const m = getPreviewState().members.get(memberId);
    return m?.onboarded ? m.displayName : null;
  },
  async countFavorites(memberId: string): Promise<number> {
    const favs = getPreviewState().favorites.get(memberId);
    if (!favs) return 0;
    let count = 0;
    for (const id of favs) {
      if (getPreviewState().recipes.get(id)?.state === 'published') count++;
    }
    return count;
  },
  async member(id: string): Promise<PublicMember | null> {
    const m = getPreviewState().members.get(id);
    if (!m || !m.onboarded) return null;
    return {
      id: m.id,
      displayName: m.displayName ?? 'Member',
      bio: m.bio,
      avatarAssetId: m.avatarAssetId ?? null,
      avatarPreset: m.avatarPreset,
      savedListPublic: m.savedListPublic,
      memberSince: m.memberSince ?? new Date().toISOString(),
    };
  },
  async list(query: CatalogQuery, viewerId: string | null): Promise<Result<CatalogPage>> {
    const state = getPreviewState();
    const q = searchKey((query.q ?? '').slice(0, 400)).slice(0, 100);
    const sort = query.sort ?? (q ? 'relevance' : 'newest');
    if (query.category && !categories.some((c) => c.id === query.category)) {
      return { ok: false, error: { status: 400, message: 'Unknown category.' } };
    }
    let items = [...state.recipes.values()].filter((r) => r.state === 'published');

    if (query.scope) {
      const scope = query.scope;
      if (scope.kind === 'author') {
        items = items.filter((r) => r.ownerId === scope.memberId);
      } else {
        if (scope.kind === 'saved' && scope.viewerId !== scope.memberId) {
          const m = state.members.get(scope.memberId);
          if (!m?.savedListPublic) {
            return { ok: false, error: { status: 404, message: 'This saved list is private.' } };
          }
        }
        const favs = state.favorites.get(scope.memberId) ?? new Set<string>();
        items = items.filter((r) => favs.has(r.id));
      }
    }

    if (q) items = items.filter((r) => buildSearchBlob(r).includes(q));
    if (query.category) items = items.filter((r) => r.input.category === query.category);
    if (query.origin) items = items.filter((r) => r.input.origin === query.origin);
    if (query.maxMinutes) {
      const max = query.maxMinutes;
      items = items.filter((r) => {
        const mins = totalMinutes(r.input);
        return mins !== null && mins <= max;
      });
    }
    if (query.diet) {
      const diet = query.diet;
      items = items.filter((r) => r.input.dietary.includes(diet));
    }

    items.sort((a, b) => {
      if (sort === 'saved') {
        const diff = favoriteCountFor(b.id) - favoriteCountFor(a.id);
        if (diff !== 0) return diff;
      }
      if (sort === 'relevance' && q) {
        const aExact = searchKey(a.input.title) === q ? 1 : 0;
        const bExact = searchKey(b.input.title) === q ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
      }
      return (b.firstPublishedAt ?? '').localeCompare(a.firstPublishedAt ?? '') || b.id.localeCompare(a.id);
    });

    const cards: RecipeCard[] = items.map((r) => {
      const tr = approvedTranslationFor(r, query.language);
      const author = r.ownerId ? state.members.get(r.ownerId) : null;
      const cover = r.input.photos[0];
      const viewerFavs = viewerId ? state.favorites.get(viewerId) : undefined;
      return {
        id: r.id,
        url: `/recipes/${r.id}/${r.slug}`,
        title: tr?.title || r.input.title || 'Untitled recipe',
        language: tr ? query.language : r.input.language,
        translated: Boolean(tr),
        authorName: author?.displayName ?? null,
        authorId: r.ownerId,
        origin: r.input.origin || null,
        totalMinutes: totalMinutes(r.input),
        ratingAverage: null,
        ratingCount: 0,
        favoriteCount: favoriteCountFor(r.id),
        favorited: Boolean(viewerFavs?.has(r.id)),
        cover: cover
          ? { assetId: cover.assetId, alt: cover.alt || cover.caption, width: cover.width, height: cover.height }
          : null,
      };
    });

    return { ok: true, value: { items: cards, nextCursor: null } };
  },
};

export const previewFavoritesService = {
  async state(memberId: string | null, recipeId: string) {
    const count = favoriteCountFor(recipeId);
    const favorited = Boolean(memberId && getPreviewState().favorites.get(memberId)?.has(recipeId));
    return { favorited, count };
  },
  async add(actor: Actor | null, recipeId: string): Promise<Result<{ favorited: true }>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign in to save recipes.' } };
    const r = getPreviewState().recipes.get(recipeId);
    if (!r || r.state !== 'published') return { ok: false, error: { status: 404, message: 'Recipe unavailable.' } };
    let set = getPreviewState().favorites.get(actor.id);
    if (!set) {
      set = new Set();
      getPreviewState().favorites.set(actor.id, set);
    }
    set.add(recipeId);
    return { ok: true, value: { favorited: true } };
  },
  async remove(actor: Actor | null, recipeId: string): Promise<Result<{ favorited: false }>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign in to save recipes.' } };
    getPreviewState().favorites.get(actor.id)?.delete(recipeId);
    return { ok: true, value: { favorited: false } };
  },
};

export const previewDraftsService = {
  async createDraft(actor: Actor | null, input?: unknown): Promise<Result<Draft>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const recipeInput = input === undefined ? emptyRecipe() : structuredClone(input as RecipeInput);
    const errors = input === undefined ? [] : validateDraft(recipeInput);
    if (errors.length) return { ok: false, error: { status: 422, message: 'Check the highlighted fields.', fields: errors } };
    const now = new Date().toISOString();
    const row: StoredRecipe = {
      id: randomUUID(),
      ownerId: actor.id,
      state: 'draft',
      version: 1,
      generation: 1,
      slug: null,
      input: recipeInput,
      createdAt: now,
      updatedAt: now,
      firstPublishedAt: null,
      deletedAt: null,
    };
    getPreviewState().recipes.set(row.id, row);
    return { ok: true, value: recipeToDraft(row) };
  },
  async readDraft(actor: Actor | null, id: string): Promise<Result<Draft>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const r = getPreviewState().recipes.get(id);
    if (!r || r.ownerId !== actor.id || r.state === 'deleted') {
      return { ok: false, error: { status: 404, message: 'Draft not found.' } };
    }
    return { ok: true, value: recipeToDraft(r) };
  },
  async listDrafts(actor: Actor | null): Promise<Result<Draft[]>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const list = [...getPreviewState().recipes.values()]
      .filter((r) => r.ownerId === actor.id && r.state === 'draft')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(recipeToDraft);
    return { ok: true, value: list };
  },
  async listPublished(actor: Actor | null): Promise<Result<Draft[]>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const list = [...getPreviewState().recipes.values()]
      .filter((r) => r.ownerId === actor.id && (r.state === 'published' || r.state === 'unpublished'))
      .sort((a, b) => (b.firstPublishedAt ?? '').localeCompare(a.firstPublishedAt ?? ''))
      .map(recipeToDraft);
    return { ok: true, value: list };
  },
  async listDeleted(actor: Actor | null): Promise<Result<Draft[]>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const list = [...getPreviewState().recipes.values()]
      .filter((r) => r.ownerId === actor.id && r.state === 'deleted' && r.firstPublishedAt !== null)
      .map(recipeToDraft);
    return { ok: true, value: list };
  },
  async saveDraft(actor: Actor | null, id: string, expectedVersion: number, input: unknown): Promise<Result<Draft>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const r = getPreviewState().recipes.get(id);
    if (!r || r.ownerId !== actor.id || r.state === 'deleted') {
      return { ok: false, error: { status: 404, message: 'Draft not found.' } };
    }
    if (r.version !== expectedVersion) {
      return { ok: false, error: { status: 409, message: 'A newer version exists. Load latest or save your work as a separate draft.' } };
    }
    const fields = validateDraft(input);
    if (fields.length) return { ok: false, error: { status: 422, message: 'Check the highlighted fields.', fields } };
    r.input = structuredClone(input as RecipeInput);
    r.version += 1;
    r.updatedAt = new Date().toISOString();
    return { ok: true, value: recipeToDraft(r) };
  },
  async copyDraft(actor: Actor | null, _id: string, _generation: number, input: unknown): Promise<Result<Draft>> {
    return this.createDraft(actor, input);
  },
  async deleteDraft(actor: Actor | null, id: string, expectedVersion: number): Promise<Result<{ deleted: boolean }>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const r = getPreviewState().recipes.get(id);
    if (!r || r.ownerId !== actor.id) return { ok: false, error: { status: 404, message: 'Draft not found.' } };
    if (r.version !== expectedVersion) return { ok: false, error: { status: 409, message: 'A newer version exists.' } };
    r.state = 'deleted';
    r.deletedAt = new Date().toISOString();
    r.version += 1;
    return { ok: true, value: { deleted: true } };
  },
  async publishRecipe(actor: Actor | null, id: string, expectedVersion: number): Promise<Result<Draft>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const r = getPreviewState().recipes.get(id);
    if (!r || r.ownerId !== actor.id) return { ok: false, error: { status: 404, message: 'Draft not found.' } };
    if (r.version !== expectedVersion) return { ok: false, error: { status: 409, message: 'A newer version exists.' } };
    const fields = validatePublication(r.input);
    if (fields.length) return { ok: false, error: { status: 422, message: 'Check the highlighted fields.', fields } };
    const now = new Date();
    r.state = 'published';
    r.slug = nextSlug(r.slug, r.input.title, r.firstPublishedAt ? new Date(r.firstPublishedAt) : null, now);
    r.firstPublishedAt ??= now.toISOString();
    r.updatedAt = now.toISOString();
    r.version += 1;
    return { ok: true, value: recipeToDraft(r) };
  },
  async unpublishRecipe(actor: Actor | null, id: string, expectedVersion: number): Promise<Result<Draft>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const r = getPreviewState().recipes.get(id);
    if (!r || r.ownerId !== actor.id) return { ok: false, error: { status: 404, message: 'Recipe not found.' } };
    if (r.version !== expectedVersion) return { ok: false, error: { status: 409, message: 'A newer version exists.' } };
    r.state = 'unpublished';
    r.version += 1;
    r.updatedAt = new Date().toISOString();
    return { ok: true, value: recipeToDraft(r) };
  },
  async deleteRecipe(actor: Actor | null, id: string, expectedVersion: number): Promise<Result<Draft>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const r = getPreviewState().recipes.get(id);
    if (!r || r.ownerId !== actor.id) return { ok: false, error: { status: 404, message: 'Recipe not found.' } };
    if (r.version !== expectedVersion) return { ok: false, error: { status: 409, message: 'A newer version exists.' } };
    r.state = 'deleted';
    r.deletedAt = new Date().toISOString();
    r.version += 1;
    return { ok: true, value: recipeToDraft(r) };
  },
  async restoreRecipe(actor: Actor | null, id: string): Promise<Result<Draft>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const r = getPreviewState().recipes.get(id);
    if (!r || r.ownerId !== actor.id || r.state !== 'deleted') return { ok: false, error: { status: 404, message: 'Recipe not found.' } };
    r.state = 'unpublished';
    r.deletedAt = null;
    r.version += 1;
    r.updatedAt = new Date().toISOString();
    return { ok: true, value: recipeToDraft(r) };
  },
  async readPublished(id: string): Promise<Result<Draft>> {
    if (!isId(id)) return { ok: false, error: { status: 404, message: 'Recipe unavailable.' } };
    const r = getPreviewState().recipes.get(id);
    if (!r || r.state !== 'published') return { ok: false, error: { status: 404, message: 'Recipe unavailable.' } };
    return { ok: true, value: recipeToDraft(r) };
  },
  async origins(): Promise<Origin[]> {
    return getPreviewState().origins;
  },
  async similarTitles(title: string) {
    const q = title.trim().toLowerCase();
    if (q.length < 3) return [];
    return [...getPreviewState().recipes.values()]
      .filter((r) => r.state === 'published' && r.input.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((r) => ({ id: r.id, title: r.input.title, url: `/recipes/${r.id}/${r.slug}` }));
  },
};

export const previewAccountService = {
  async ensureMember() {
    const actor = previewActor();
    if (!actor) throw new Error('Preview member missing');
    return actor;
  },
  async requireActor(request: Request) {
    const actor = previewActor(request);
    if (!actor) {
      const { AccountError } = await import('../features/accounts/permissions');
      throw new AccountError(401, 'Sign-in required');
    }
    return actor;
  },
  async requireAdmin(request: Request) {
    const actor = await this.requireActor(request);
    const { assertAdmin } = await import('../features/accounts/permissions');
    assertAdmin(actor);
    return actor;
  },
  async requireOwner(request: Request) {
    const actor = await this.requireActor(request);
    const { assertOwner } = await import('../features/accounts/permissions');
    assertOwner(actor);
    return actor;
  },
  async requireOwnedContribution(request: Request) {
    return this.requireActor(request);
  },
  async updateProfile(request: Request, fields: Record<string, unknown>) {
    const actor = await this.requireActor(request);
    const name = typeof fields.displayName === 'string' ? fields.displayName.trim() : '';
    const bio = typeof fields.bio === 'string' ? fields.bio : '';
    const preset = fields.avatarPreset === '' || fields.avatarPreset === undefined ? null : (fields.avatarPreset as Actor['avatarPreset']);
    if (!name || name.length > 80 || bio.length > 400 || (preset !== null && !['chile', 'corn', 'lime'].includes(preset))) {
      const { AccountError } = await import('../features/accounts/permissions');
      throw new AccountError(400, 'Check your display name, bio and avatar');
    }
    const savedListPublic = fields.savedListPublic === undefined ? true : fields.savedListPublic === true || fields.savedListPublic === 'true';
    actor.displayName = name;
    actor.bio = bio;
    actor.avatarPreset = preset;
    actor.savedListPublic = savedListPublic;
    actor.onboarded = true;
    return actor;
  },
  async inviteAdmin(request: Request, value: unknown) {
    const actor = await this.requireOwner(request);
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    const invite = { id: randomUUID(), email, expires_at: new Date(Date.now() + 7 * 86400_000) };
    getPreviewState().invitations.unshift(invite);
    getPreviewState().audit.unshift({
      id: randomUUID(),
      action: 'admin_invited',
      actor_id: actor.id,
      target_id: invite.id,
      created_at: new Date(),
      actor_name: actor.displayName,
      target_name: email,
    });
    return { id: invite.id };
  },
  async revokeInvitation(request: Request, id: string) {
    const actor = await this.requireOwner(request);
    const state = getPreviewState();
    state.invitations = state.invitations.filter((i) => i.id !== id);
    state.audit.unshift({
      id: randomUUID(),
      action: 'invitation_revoked',
      actor_id: actor.id,
      target_id: id,
      created_at: new Date(),
      actor_name: actor.displayName,
      target_name: 'Invitation',
    });
  },
  async removeAdmin(request: Request, targetId: string) {
    const actor = await this.requireOwner(request);
    const member = getPreviewState().members.get(targetId);
    if (member && member.role === 'admin') {
      member.role = 'member';
      getPreviewState().audit.unshift({
        id: randomUUID(),
        action: 'admin_removed',
        actor_id: actor.id,
        target_id: targetId,
        created_at: new Date(),
        actor_name: actor.displayName,
        target_name: member.displayName,
      });
    }
  },
  async readAudit(request: Request) {
    await this.requireOwner(request);
    return getPreviewState().audit;
  },
  async listAdministrators(request: Request) {
    await this.requireOwner(request);
    const members = [...getPreviewState().members.values()]
      .filter((m) => m.role === 'admin')
      .map((m) => ({ id: m.id, display_name: m.displayName }));
    return { members, invitations: getPreviewState().invitations };
  },
};

const VARIANT_DIMS = {
  thumb: { width: 320, height: 240 },
  card: { width: 640, height: 400 },
  gallery: { width: 1200, height: 900 },
  avatar: { width: 256, height: 256 },
} as const;

async function renderVariant(asset: StoredAsset, variant: keyof typeof VARIANT_DIMS): Promise<Buffer> {
  const key = `${asset.id}:${variant}`;
  const state = getPreviewState();
  const cached = state.bufferCache.get(key);
  if (cached) return cached;
  const source = asset.rawBytes ?? (asset.filePath ? readFileSync(asset.filePath) : null);
  if (!source) throw new Error('Missing image source');
  const dims = VARIANT_DIMS[variant];
  const out = await sharp(source)
    .rotate()
    .resize(dims.width, dims.height, { fit: 'cover', position: 'centre' })
    .webp({ quality: 84 })
    .toBuffer();
  state.bufferCache.set(key, out);
  return out;
}

export const previewMediaService = {
  async createUploadIntent(actor: Actor | null, input: Record<string, unknown>): Promise<MediaResult<UploadIntent>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const id = randomUUID();
    const purpose = String(input.purpose || 'recipe') as Purpose;
    getPreviewState().uploadIntents.set(id, { id, ownerId: actor.id, purpose });
    return {
      ok: true,
      value: {
        id,
        path: `/preview/${actor.id}/${id}/image.webp`,
        expiresAt: Date.now() + 300_000,
        grant: {
          endpoint: '/api/media/local-upload',
          fields: {},
          token: id,
        },
      },
    };
  },
  async acceptPreviewUpload(token: string, bytes: Buffer) {
    const intent = getPreviewState().uploadIntents.get(token);
    if (intent) intent.bytes = bytes;
  },
  async completeUpload(actor: Actor | null, intentId: string): Promise<MediaResult<AssetRef>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const intent = getPreviewState().uploadIntents.get(intentId);
    if (!intent || !intent.bytes) return { ok: false, error: { status: 400, message: 'Photo could not be verified. Please retry.' } };
    const meta = await sharp(intent.bytes).metadata();
    const id = randomUUID();
    const width = meta.width ?? 1200;
    const height = meta.height ?? 900;
    getPreviewState().assets.set(id, {
      id,
      ownerId: actor.id,
      purpose: intent.purpose,
      width,
      height,
      rawBytes: intent.bytes,
    });
    return { ok: true, value: { id, width, height } };
  },
  async setAvatar(actor: Actor | null, assetId: string | null): Promise<MediaResult<AssetRef | null>> {
    if (!actor) return { ok: false, error: { status: 401, message: 'Sign-in required.' } };
    const member = getPreviewState().members.get(actor.id);
    if (member) member.avatarAssetId = assetId;
    const asset = assetId ? getPreviewState().assets.get(assetId) : null;
    return { ok: true, value: asset ? { id: asset.id, width: asset.width, height: asset.height } : null };
  },
  async readDerivative(_actor: Actor | null, assetId: string, variant: string): Promise<MediaResult<Buffer>> {
    const asset = getPreviewState().assets.get(assetId);
    if (!asset || !(variant in VARIANT_DIMS)) return { ok: false, error: { status: 404, message: 'Photo not found.' } };
    return { ok: true, value: await renderVariant(asset, variant as keyof typeof VARIANT_DIMS) };
  },
  async checkDerivative(_actor: Actor | null, assetId: string, variant: string): Promise<MediaResult<true>> {
    const asset = getPreviewState().assets.get(assetId);
    if (!asset || !(variant in VARIANT_DIMS)) return { ok: false, error: { status: 404, message: 'Photo not found.' } };
    return { ok: true, value: true };
  },
  async readRecipeDerivative(recipeId: string, assetId: string, variant: string): Promise<MediaResult<Buffer>> {
    const recipe = getPreviewState().recipes.get(recipeId);
    const asset = getPreviewState().assets.get(assetId);
    if (!recipe || recipe.state !== 'published' || !asset || !(variant in VARIANT_DIMS)) {
      return { ok: false, error: { status: 404, message: 'Photo not found.' } };
    }
    return { ok: true, value: await renderVariant(asset, variant as keyof typeof VARIANT_DIMS) };
  },
  async readMemberAvatar(memberId: string): Promise<MediaResult<{ assetId: string; bytes: Buffer }>> {
    const member = getPreviewState().members.get(memberId);
    if (!member?.avatarAssetId) return { ok: false, error: { status: 404, message: 'Photo not found.' } };
    const asset = getPreviewState().assets.get(member.avatarAssetId);
    if (!asset) return { ok: false, error: { status: 404, message: 'Photo not found.' } };
    return { ok: true, value: { assetId: asset.id, bytes: await renderVariant(asset, 'avatar') } };
  },
  async disposeUnusedAsset() {},
};

function computeBlockers(entry: StoredCookbookEntry, recipe: StoredRecipe): string[] {
  const missing = [...new Set(validatePublication(recipe.input).map((f) => f.field.split('.')[0]))];
  if (entry.textReview !== 'approved') missing.push('text-review');
  if (entry.imageReview !== 'approved') missing.push('image-review');
  if (entry.flags.includes('third-party-source') && !entry.sourceClearance) missing.push('source-permission');
  const uncredited = recipe.input.photos.some((p) => !getPreviewState().photoCredits.has(p.assetId));
  if (uncredited) missing.push('photo-credit');
  return missing;
}

export const previewCookbookService = {
  async listQueue(_actor: Actor | null, filter: QueueFilter): Promise<Result<QueueRow[]>> {
    const state = getPreviewState();
    const out: QueueRow[] = [];
    for (const entry of state.cookbookEntries.values()) {
      const r = state.recipes.get(entry.recipeId);
      if (!r) continue;
      const missing = r.state === 'published' ? [] : computeBlockers(entry, r);
      const eligible = r.state === 'draft' && missing.length === 0;
      if ((filter === 'eligible' && !eligible) || (filter === 'blocked' && (eligible || r.state === 'published'))) continue;
      const trStatus = (lang: 'en' | 'es') => {
        const list = state.translations.filter((t) => t.recipeId === r.id && t.language === lang).map((t) => t.status);
        return list.includes('approved') ? 'approved' : list.includes('proposed') ? 'proposed' : list.includes('outdated') ? 'outdated' : 'none';
      };
      out.push({
        entryId: entry.entryId,
        recipeId: r.id,
        version: r.version,
        key: entry.key,
        title: r.input.title || 'Untitled recipe',
        pages: entry.pages,
        contributor: entry.contributor,
        state: r.state,
        textReview: entry.textReview,
        imageReview: entry.imageReview,
        translation: { en: trStatus('en'), es: trStatus('es') },
        missing,
        flags: entry.flags,
        eligible,
        sourceClearance: !entry.flags.includes('third-party-source') ? 'not-needed' : entry.sourceClearance ? 'cleared' : 'pending',
        sourceNote: entry.sourceClearance,
        sources: entry.sourceUrls,
      });
    }
    return { ok: true, value: out };
  },
  async readEntryRecipe(_actor: Actor | null, recipeId: string): Promise<{ input: RecipeInput; slug: string | null } | undefined> {
    const r = getPreviewState().recipes.get(recipeId);
    return r ? { input: structuredClone(r.input), slug: r.slug } : undefined;
  },
  async markTextReviewed(_actor: Actor | null, entryId: string, expectedVersion: number): Promise<Result<{ textReview: 'approved' }>> {
    const state = getPreviewState();
    const entry = state.cookbookEntries.get(entryId);
    const r = entry ? state.recipes.get(entry.recipeId) : null;
    if (!entry || !r) return { ok: false, error: { status: 404, message: 'Entry not found.' } };
    if (r.version !== expectedVersion) return { ok: false, error: { status: 409, message: 'This recipe changed since you opened it.' } };
    entry.textReview = 'approved';
    return { ok: true, value: { textReview: 'approved' } };
  },
  async publishImported(_actor: Actor | null, entryId: string): Promise<Result<{ id: string; url: string }>> {
    const state = getPreviewState();
    const entry = state.cookbookEntries.get(entryId);
    const r = entry ? state.recipes.get(entry.recipeId) : null;
    if (!entry || !r) return { ok: false, error: { status: 404, message: 'Entry not found.' } };
    if (r.state !== 'draft') return { ok: false, error: { status: 409, message: 'This recipe is already published or unavailable.' } };
    const missing = computeBlockers(entry, r);
    if (missing.length) return { ok: false, error: { status: 409, message: "This recipe isn't ready to publish." } };
    const now = new Date();
    r.state = 'published';
    r.slug = nextSlug(null, r.input.title, null, now);
    r.firstPublishedAt = now.toISOString();
    r.updatedAt = now.toISOString();
    r.version += 1;
    return { ok: true, value: { id: r.id, url: `/recipes/${r.id}/${r.slug}` } };
  },
  async correctEntry(_actor: Actor | null, entryId: string, change: { version: number; input: unknown; reason: unknown }) {
    const state = getPreviewState();
    const entry = state.cookbookEntries.get(entryId);
    const r = entry ? state.recipes.get(entry.recipeId) : null;
    if (!entry || !r) return { ok: false as const, error: { status: 404, message: 'Entry not found.' } };
    if (r.version !== change.version) return { ok: false as const, error: { status: 409, message: 'This recipe changed since you opened it.' } };
    const reason = typeof change.reason === 'string' ? change.reason.trim() : '';
    if (!reason) return { ok: false as const, error: { status: 422, message: 'Say why you made this correction.' } };
    const fields = validateDraft(change.input);
    if (fields.length) return { ok: false as const, error: { status: 422, message: 'Check the highlighted fields.', fields } };
    r.input = structuredClone(change.input as RecipeInput);
    r.version += 1;
    r.updatedAt = new Date().toISOString();
    entry.textReview = 'pending';
    return { ok: true as const, value: { version: r.version, textReview: entry.textReview, imageReview: entry.imageReview } };
  },
  async recordPhotoCredit(_actor: Actor | null, entryId: string, change: { version: number; assetId: string; credit: unknown }) {
    const state = getPreviewState();
    const entry = state.cookbookEntries.get(entryId);
    if (!entry) return { ok: false as const, error: { status: 404, message: 'Entry not found.' } };
    const credit = change.credit as Partial<PhotoCreditInput & { photographer?: string; sourceUrl?: string; retrievedOn?: string; cropping?: string }>;
    state.photoCredits.set(change.assetId, {
      kind: credit.kind ?? 'owner',
      photographer: credit.photographer ?? '',
      sourceUrl: credit.sourceUrl ?? '',
      license: credit.license ?? '',
      retrievedOn: credit.retrievedOn ?? '',
      cropping: credit.cropping ?? '',
    });
    if (entry.imageReview === 'approved') entry.imageReview = 'pending';
    return { ok: true as const, value: { imageReview: entry.imageReview } };
  },
  async markImagesReviewed(_actor: Actor | null, entryId: string) {
    const entry = getPreviewState().cookbookEntries.get(entryId);
    if (!entry) return { ok: false as const, error: { status: 404, message: 'Entry not found.' } };
    entry.imageReview = 'approved';
    return { ok: true as const, value: { imageReview: 'approved' as const } };
  },
  async clearSource(_actor: Actor | null, entryId: string, change: { version: number; note: unknown }) {
    const entry = getPreviewState().cookbookEntries.get(entryId);
    if (!entry) return { ok: false as const, error: { status: 404, message: 'Entry not found.' } };
    const note = typeof change.note === 'string' ? change.note.trim() : '';
    if (!note) return { ok: false as const, error: { status: 422, message: 'Say how reuse was cleared.' } };
    entry.sourceClearance = note;
    return { ok: true as const, value: { sourceClearance: 'cleared' as const } };
  },
  async credits(_actor: Actor | null, entryId: string): Promise<Result<Record<string, { kind: PhotoCreditInput['kind']; photographer: string; sourceUrl: string; license: string; retrievedOn: string; cropping: string }>>> {
    const state = getPreviewState();
    const entry = state.cookbookEntries.get(entryId);
    const r = entry ? state.recipes.get(entry.recipeId) : null;
    if (!entry || !r) return { ok: true, value: {} };
    const out: Record<string, { kind: PhotoCreditInput['kind']; photographer: string; sourceUrl: string; license: string; retrievedOn: string; cropping: string }> = {};
    for (const p of r.input.photos) {
      const c = state.photoCredits.get(p.assetId);
      if (c) out[p.assetId] = { ...c };
    }
    return { ok: true, value: out };
  },
};

export const previewTranslationService = {
  async saveTranslation(_actor: Actor | null, recipeId: string, language: 'en' | 'es', sourceVersion: number, input: unknown): Promise<Result<{ id: string; status: 'proposed' }>> {
    const state = getPreviewState();
    const r = state.recipes.get(recipeId);
    if (!r) return { ok: false, error: { status: 404, message: 'Recipe not found.' } };
    if (r.version !== sourceVersion) return { ok: false, error: { status: 409, message: 'The recipe changed. Reload it before translating.' } };
    state.translations = state.translations.filter(
      (t) => !(t.recipeId === recipeId && t.language === language && t.status === 'proposed'),
    );
    const row: StoredTranslation = {
      id: randomUUID(),
      recipeId,
      language,
      sourceVersion,
      status: 'proposed',
      input: structuredClone(input as TranslatableText),
      updatedAt: new Date().toISOString(),
    };
    state.translations.push(row);
    return { ok: true, value: { id: row.id, status: 'proposed' } };
  },
  async approveTranslations(_actor: Actor | null, items: { id: string; sourceVersion: number }[]): Promise<Result<{ approved: number; conflicts: string[] }>> {
    const state = getPreviewState();
    let approved = 0;
    const conflicts: string[] = [];
    for (const item of items) {
      const tr = state.translations.find((t) => t.id === item.id);
      const r = tr ? state.recipes.get(tr.recipeId) : null;
      if (!tr || !r || tr.status !== 'proposed' || tr.sourceVersion !== item.sourceVersion || r.version !== item.sourceVersion) {
        conflicts.push(item.id);
        continue;
      }
      for (const prev of state.translations) {
        if (prev.recipeId === tr.recipeId && prev.language === tr.language && prev.status === 'approved') {
          prev.status = 'outdated';
        }
      }
      tr.status = 'approved';
      tr.updatedAt = new Date().toISOString();
      approved++;
    }
    return { ok: true, value: { approved, conflicts } };
  },
  async listProposals(): Promise<Result<{ id: string; recipeId: string; title: string; language: 'en' | 'es'; sourceVersion: number; current: boolean }[]>> {
    const state = getPreviewState();
    const out = state.translations
      .filter((t) => t.status === 'proposed')
      .map((t) => {
        const r = state.recipes.get(t.recipeId);
        return {
          id: t.id,
          recipeId: t.recipeId,
          title: t.input.title,
          language: t.language,
          sourceVersion: t.sourceVersion,
          current: Boolean(r && r.version === t.sourceVersion),
        };
      });
    return { ok: true, value: out };
  },
  async readForReview(_actor: Actor | null, recipeId: string) {
    const state = getPreviewState();
    const r = state.recipes.get(recipeId);
    if (!r) return { ok: false as const, error: { status: 404, message: 'Recipe not found.' } };
    const rows = state.translations
      .filter((t) => t.recipeId === recipeId && (t.status === 'proposed' || t.status === 'approved'))
      .map((t) => ({
        id: t.id,
        language: t.language,
        status: t.status,
        source_version: t.sourceVersion,
        input: structuredClone(t.input),
      }));
    return { ok: true as const, value: { input: structuredClone(r.input), version: r.version, translations: rows } };
  },
  readerTranslation(recipeId: string, language: 'en' | 'es') {
    return previewCatalogService.readerTranslation(recipeId, language);
  },
};
