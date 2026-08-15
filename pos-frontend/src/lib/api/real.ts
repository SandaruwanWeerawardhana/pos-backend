import type { ApiClient } from "./client";
import { authService, orderService, productService } from "@/lib/services";

export const realApi: ApiClient = {
  login: (email, password) => authService.login(email, password),
  register: (ownerName, businessName, email, password, businessType) =>
    authService.register(
      ownerName,
      businessName,
      email,
      password,
      businessType,
    ),
  requestPasswordReset: (email) => authService.requestPasswordReset(email),
  resetPassword: (token, newPassword) =>
    authService.resetPassword(token, newPassword),
  changePassword: (currentPassword, newPassword) =>
    authService.changePassword(currentPassword, newPassword),
  updateProfile: (update) => authService.updateProfile(update),
  getProducts: () => productService.getProducts(),
  createProduct: (product) => productService.createProduct(product),
  updateProduct: (product) => productService.updateProduct(product),
  deleteProduct: (id) => productService.deleteProduct(id),
  syncOrders: (orders) => orderService.syncOrders(orders),
  getOrders: (params) => orderService.getOrders(params),
};
