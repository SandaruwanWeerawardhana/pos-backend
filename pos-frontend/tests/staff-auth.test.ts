import { db } from "@/lib/db";
import {
  ADMIN_ROLE_ID,
  CASHIER_ROLE_ID,
  authenticateStaff,
  createStaffUser,
  ensureSystemRoles,
  isPosOnly,
  setStaffPin,
  updateStaffUser,
} from "@/lib/db/users";

beforeEach(async () => {
  await db.staffUsers.clear();
  await db.roles.clear();
  await ensureSystemRoles();
});

async function addCashier(pin = "1234") {
  return createStaffUser({
    name: "Ana Perera",
    email: "ana@shop.test",
    role_id: CASHIER_ROLE_ID,
    pin,
    active: true,
  });
}

describe("till PIN storage", () => {
  it("stores a salted digest, never the PIN itself", async () => {
    const user = await addCashier("4821");
    expect(user.pin_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(user.pin_salt).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(user)).not.toContain("4821");
  });

  it("salts per user, so the same PIN hashes differently", async () => {
    const first = await addCashier("1111");
    const second = await createStaffUser({
      name: "Ravi Silva",
      email: "ravi@shop.test",
      role_id: CASHIER_ROLE_ID,
      pin: "1111",
      active: true,
    });
    expect(first.pin_hash).not.toBe(second.pin_hash);
  });

  it("rejects a PIN that is not 4 to 6 digits", async () => {
    await expect(addCashier("12")).rejects.toThrow("PIN must be 4 to 6 digits");
    await expect(addCashier("abcd")).rejects.toThrow("PIN must be 4 to 6 digits");
  });
});

describe("authenticateStaff", () => {
  it("returns the user and role for a correct email and PIN", async () => {
    await addCashier("1234");
    const result = await authenticateStaff("ANA@shop.test", "1234");
    expect(result?.user.name).toBe("Ana Perera");
    expect(result?.role.id).toBe(CASHIER_ROLE_ID);
  });

  it("returns null for a wrong PIN, unknown email, or disabled account", async () => {
    const user = await addCashier("1234");
    expect(await authenticateStaff("ana@shop.test", "9999")).toBeNull();
    expect(await authenticateStaff("nobody@shop.test", "1234")).toBeNull();

    await updateStaffUser(user.id, { active: false });
    expect(await authenticateStaff("ana@shop.test", "1234")).toBeNull();
  });

  it("stops accepting the old PIN after a reset", async () => {
    const user = await addCashier("1234");
    await setStaffPin(user.id, "567890");
    expect(await authenticateStaff("ana@shop.test", "1234")).toBeNull();
    expect(await authenticateStaff("ana@shop.test", "567890")).not.toBeNull();
  });

  it("refuses a user who has no PIN set", async () => {
    await createStaffUser({
      name: "No Pin",
      email: "nopin@shop.test",
      role_id: CASHIER_ROLE_ID,
      active: true,
    });
    expect(await authenticateStaff("nopin@shop.test", "1234")).toBeNull();
  });
});

describe("roles", () => {
  it("seeds exactly Admin and Cashier", async () => {
    const roles = await db.roles.orderBy("name").toArray();
    expect(roles.map((role) => role.name)).toEqual(["Admin", "Cashier"]);
  });

  it("pins Cashier to the till and leaves Admin the office", async () => {
    const roles = await db.roles.toArray();
    const byId = (id: string) => roles.find((role) => role.id === id)!;
    expect(isPosOnly(byId(CASHIER_ROLE_ID).permissions)).toBe(true);
    expect(isPosOnly(byId(ADMIN_ROLE_ID).permissions)).toBe(false);
  });

  it("retires legacy roles and moves their staff to Admin", async () => {
    await db.roles.put({
      id: "role_manager",
      name: "Manager",
      permissions: ["pos.sell", "reports.view"],
      is_system: true,
      created_at: Date.now(),
    });
    const user = await createStaffUser({
      name: "Old Manager",
      email: "manager@shop.test",
      role_id: "role_manager",
      pin: "4321",
      active: true,
    });

    await ensureSystemRoles();

    expect(await db.roles.get("role_manager")).toBeUndefined();
    expect((await db.staffUsers.get(user.id))?.role_id).toBe(ADMIN_ROLE_ID);
    // The reassignment must not cost the user their PIN.
    expect(await authenticateStaff("manager@shop.test", "4321")).not.toBeNull();
  });
});
