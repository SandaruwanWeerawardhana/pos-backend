import { db } from "./index";
import { PERMISSIONS, type Permission, type Role, type StaffUser } from "@/lib/types";

// Local-only tables, no server sync yet (no backend endpoint exists).

export const ADMIN_ROLE_ID = "role_admin";
export const CASHIER_ROLE_ID = "role_cashier";

// Roles every install starts with. Admin carries every permission so there is
// always an account that can reach the users screen, and is not deletable for
// that reason; Cashier is till-only. Anything beyond these two is created by
// the manager on the group permissions screen.
const SYSTEM_ROLES: Omit<Role, "created_at">[] = [
  {
    id: ADMIN_ROLE_ID,
    name: "Admin",
    description: "Full access to every screen and setting",
    permissions: [...PERMISSIONS],
    is_system: true,
  },
  {
    id: CASHIER_ROLE_ID,
    name: "Cashier",
    description: "Till only — sell, look up products and stock",
    permissions: ["pos.sell", "products.view", "inventory.view"],
    is_system: true,
  },
];

// Permissions that only make sense in the back office. A role holding none of
// them is a till-only role, which is what pins its holder to the POS screen.
const OFFICE_PERMISSIONS: Permission[] = [
  "products.manage",
  "inventory.adjust",
  "purchases.view",
  "purchases.manage",
  "reports.view",
  "settings.manage",
  "users.manage",
];

export function isPosOnly(permissions: Permission[]): boolean {
  return !permissions.some((permission) =>
    OFFICE_PERMISSIONS.includes(permission),
  );
}

/**
 * Seeds Admin and Cashier if they are missing, and nothing else: this runs on
 * every boot, so overwriting existing rows would wipe permission edits made on
 * the group permissions screen, and deleting unknown rows would wipe the
 * manager's own roles. Users left pointing at a role that no longer exists are
 * moved to Admin, which never strands an account outside the users screen.
 */
export async function ensureSystemRoles(): Promise<void> {
  await db.transaction("rw", db.roles, db.staffUsers, async () => {
    const existing = await db.roles.toArray();
    const known = new Set(existing.map((role) => role.id));

    const missing = SYSTEM_ROLES.filter((role) => !known.has(role.id)).map(
      (role) => ({ ...role, created_at: Date.now() }),
    );
    if (missing.length > 0) {
      await db.roles.bulkAdd(missing);
      for (const role of missing) known.add(role.id);
    }

    const orphans = await db.staffUsers
      .filter((user) => !known.has(user.role_id))
      .toArray();
    if (orphans.length === 0) return;
    await db.staffUsers.bulkPut(
      orphans.map((user) => ({ ...user, role_id: ADMIN_ROLE_ID })),
    );
  });
}

export async function createRole(
  input: Pick<Role, "name" | "description" | "permissions">,
): Promise<Role> {
  const name = input.name.trim();
  if (!name) throw new Error("Role name is required");
  const clash = await db.roles
    .filter((role) => role.name.toLowerCase() === name.toLowerCase())
    .first();
  if (clash) throw new Error("A role with that name already exists");

  const role: Role = {
    id: crypto.randomUUID(),
    name,
    description: input.description?.trim() || undefined,
    permissions: input.permissions,
    created_at: Date.now(),
  };
  await db.roles.add(role);
  return role;
}

/**
 * System roles keep their identity: Admin must stay all-permissions so an
 * install cannot lock itself out, so only the description is editable there.
 */
export async function updateRole(
  id: string,
  changes: Partial<Pick<Role, "name" | "description" | "permissions">>,
): Promise<void> {
  const role = await db.roles.get(id);
  if (!role) throw new Error("That role no longer exists");

  const next: Partial<Role> = { description: changes.description?.trim() };

  if (!role.is_system) {
    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (!name) throw new Error("Role name is required");
      const clash = await db.roles
        .filter(
          (other) =>
            other.id !== id && other.name.toLowerCase() === name.toLowerCase(),
        )
        .first();
      if (clash) throw new Error("A role with that name already exists");
      next.name = name;
    }
    if (changes.permissions) next.permissions = changes.permissions;
  } else if (id !== ADMIN_ROLE_ID && changes.permissions) {
    next.permissions = changes.permissions;
  }

  await db.roles.update(id, next);
}

/**
 * Refuses while the role still has members: silently moving someone to another
 * role would change what they can do at the till without anyone being told.
 */
export async function deleteRole(id: string): Promise<void> {
  const role = await db.roles.get(id);
  if (!role) return;
  if (role.is_system) throw new Error("Built-in roles cannot be deleted");

  const members = await db.staffUsers.where("role_id").equals(id).count();
  if (members > 0) {
    throw new Error(
      `${members} user${members === 1 ? "" : "s"} still have this role. Move them first.`,
    );
  }
  await db.roles.delete(id);
}

export async function listRoles(): Promise<Role[]> {
  return db.roles.orderBy("name").toArray();
}

export async function getRole(id: string): Promise<Role | undefined> {
  return db.roles.get(id);
}

export async function listStaffUsers(): Promise<StaffUser[]> {
  return db.staffUsers.orderBy("email").toArray();
}

export async function getStaffUser(id: string): Promise<StaffUser | undefined> {
  return db.staffUsers.get(id);
}

/**
 * First/last name for display. Rows created before the split fields existed
 * carry only `name`, so it is divided on the first space — everything after it
 * counts as the surname, which is right for "Maria del Carmen Ruiz".
 */
export function nameParts(user: StaffUser): {
  first: string;
  last: string;
} {
  if (user.first_name || user.last_name) {
    return { first: user.first_name ?? "", last: user.last_name ?? "" };
  }
  const trimmed = user.name.trim();
  const space = trimmed.indexOf(" ");
  if (space === -1) return { first: trimmed, last: "" };
  return {
    first: trimmed.slice(0, space),
    last: trimmed.slice(space + 1).trim(),
  };
}

export function displayUsername(user: StaffUser): string {
  return user.username?.trim() || user.name;
}

export const PIN_PATTERN = /^\d{4,6}$/;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// A 4-6 digit PIN has too little entropy for the hash to withstand an attacker
// who has already taken the device and can read IndexedDB — brute forcing ten
// thousand candidates is trivial. Hashing is here so a PIN is not readable at a
// glance (over a shoulder, in devtools, in an exported backup) and so PINs are
// not reused verbatim elsewhere. Real protection stays with device custody.
async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

async function pinFields(pin: string): Promise<Pick<StaffUser, "pin_hash" | "pin_salt">> {
  if (!PIN_PATTERN.test(pin)) throw new Error("PIN must be 4 to 6 digits");
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { pin_salt: salt, pin_hash: await hashPin(pin, salt) };
}

export async function createStaffUser(
  input: Omit<StaffUser, "id" | "created_at" | "pin_hash" | "pin_salt"> & {
    pin?: string;
  },
): Promise<StaffUser> {
  const { pin, ...rest } = input;
  const existing = await db.staffUsers.where("email").equals(rest.email).first();
  if (existing) throw new Error("A user with that email already exists");
  const user: StaffUser = {
    ...rest,
    ...(pin ? await pinFields(pin) : {}),
    id: crypto.randomUUID(),
    created_at: Date.now(),
  };
  await db.staffUsers.add(user);
  return user;
}

export async function setStaffPin(id: string, pin: string): Promise<void> {
  await db.staffUsers.update(id, await pinFields(pin));
}

export interface StaffAuthResult {
  user: StaffUser;
  role: Role;
}

// Till sign-in: email plus PIN, resolved entirely against the local tables so
// a cashier can start a shift with the network down. Returns null for every
// failure mode (unknown email, disabled account, no PIN set, wrong PIN) so the
// caller cannot use the result to probe which staff emails exist.
export async function authenticateStaff(
  email: string,
  pin: string,
): Promise<StaffAuthResult | null> {
  const user = await db.staffUsers
    .where("email")
    .equals(email.trim().toLowerCase())
    .first();
  if (!user?.active || !user.pin_hash || !user.pin_salt) return null;
  if ((await hashPin(pin, user.pin_salt)) !== user.pin_hash) return null;
  const role = await db.roles.get(user.role_id);
  if (!role) return null;
  return { user, role };
}

export async function updateStaffUser(
  id: string,
  // PIN changes go through `setStaffPin`, which does the salting and hashing.
  changes: Partial<
    Pick<
      StaffUser,
      | "name"
      | "first_name"
      | "last_name"
      | "username"
      | "phone"
      | "avatar"
      | "view_all_records"
      | "warehouse_ids"
      | "email"
      | "role_id"
      | "active"
    >
  >,
): Promise<void> {
  await db.staffUsers.update(id, changes);
}

export async function deleteStaffUser(id: string): Promise<void> {
  await db.staffUsers.delete(id);
}

export function hasPermission(
  role: Role | null | undefined,
  permission: Permission,
): boolean {
  return Boolean(role?.permissions.includes(permission));
}
