const API_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:8000/graphql/";

async function _fetch<T>(query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `JWT ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors[0].message || "Something went wrong.");
  return payload.data;
}

// Silently exchange a refresh token for a new access token and persist it.
export async function refreshAccessToken(): Promise<string | null> {
  const rt = localStorage.getItem("refreshToken");
  if (!rt) return null;
  try {
    const data = await _fetch<{ refreshToken: { token: string; refreshToken: string } }>(
      `mutation R($rt:String!){refreshToken(refreshToken:$rt){token refreshToken}}`,
      { rt }
    );
    const { token, refreshToken: newRt } = data.refreshToken;
    localStorage.setItem("jwt", token);
    localStorage.setItem("refreshToken", newRt);
    return token;
  } catch {
    // Refresh token itself expired — force logout
    localStorage.removeItem("jwt");
    localStorage.removeItem("refreshToken");
    return null;
  }
}

const EXPIRED_PHRASES = ["signature has expired", "token is expired", "expired"];

export async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string,
): Promise<T> {
  try {
    return await _fetch<T>(query, variables, token);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    // Auto-refresh on expiry, then retry once
    if (token && EXPIRED_PHRASES.some(p => msg.includes(p))) {
      const newToken = await refreshAccessToken();
      if (newToken) return _fetch<T>(query, variables, newToken);
      // Refresh failed — propagate so the app can redirect to login
      throw new Error("SESSION_EXPIRED");
    }
    throw err;
  }
}

export const SETTINGS_QUERY = `
  query PublicSettings {
    systemSettings { appName appSubtitle logoUrl primaryColor accentColor defaultDarkMode companyName }
  }
`;

export const DASHBOARD_QUERY = `
  query GarmentDashboard {
    systemSettings {
      id appName appSubtitle logoUrl primaryColor accentColor defaultDarkMode
      companyName currencySymbol taxPercent
      smtpHost smtpPort smtpUser smtpFromEmail emailEnabled
      twilioAccountSid twilioFromNumber smsEnabled
      waPhoneNumberId waEnabled
      fcmEnabled
      otpExpiryMinutes allowOtpLogin
    }
    employeeProfile { id role phone active username email locations { id name code locationType } }
    warehouseLocations { id name code locationType city state address phone active }
    dashboardStats {
      totalRawMeters totalFinishedPieces readymadePieces inhousePieces
      activePurchaseOrders activeSalesOrders
      cuttingInProgress stitchingInProgress
      creditOutstanding revenueThisMonth revenueThisYear
      totalSuppliers totalBuyers
      supplierTotalPurchased supplierTotalPaid supplierTotalPending
      creditReceived creditOverdue creditSettled
      expensesThisMonth expensesThisYear
    }
    clothCategories { id name description active }
    clothColors { id name hexCode active }
    itemTypes { id name category clothLengthPerPiece active }
    suppliers { id name contactPerson email phone whatsapp address city state gstin supplyType creditDays notes active }
    buyers { id name contactPerson email phone whatsapp address city state gstin buyerType creditLimit notes active }
    purchaseOrders(limit: 100) {
      id poNumber orderType status orderDate expectedDelivery actualDelivery totalAmount notes createdAt
      supplier { id name phone }
      warehouse { id name code }
      items { id itemKind orderedMeters receivedMeters orderedQuantity receivedQuantity unitPrice totalPrice notes
        clothCategory { id name } clothColor { id name hexCode } itemType { id name } }
    }
    expenses(limit: 500) {
      id expenseNumber category amount expenseDate description reference createdAt
      warehouse { id name }
    }
    purchaseBills(limit: 100) {
      id billNumber billDate invoiceRef billImage totalAmount amountPaid amountPending paymentStatus notes createdAt
      supplier { id name }
      warehouse { id name }
      items {
        id itemKind totalMeters costPerMeter binLocation clothCode
        size quantity unitPrice totalPrice notes
        clothCategory { id name } clothColor { id name hexCode } itemType { id name }
      }
      supplierPayments { id paymentNumber amount paymentDate paymentMode reference notes createdAt }
    }
    rawClothBatches {
      id batchNumber totalMeters availableMeters costPerMeter binLocation receivedDate
      supplier { id name }
      clothCategory { id name }
      clothColor { id name hexCode }
      warehouse { id name code }
    }
    readymadeStock {
      id size quantityReceived quantityAvailable costPrice receivedDate
      itemType { id name }
      clothColor { id name hexCode }
      warehouse { id name code }
      supplier { id name }
    }
    cuttingAssignments(limit: 100) {
      id assignmentNumber metersAssigned targetPieces size status assignedDate dueDate
      piecesCompleted clothUsed clothWasted completedDate notes costPerPiece
      rawClothBatch { id batchNumber clothCategory { name } clothColor { name hexCode } costPerMeter }
      cuttingMaster { id username role }
      itemType { id name }
    }
    stitchingJobs(limit: 100) {
      id jobNumber piecesAssigned piecesCompleted piecesRejected status assignedDate dueDate completedDate notes
      cuttingAssignment { id assignmentNumber itemType { name } }
      tailor { id username role }
    }
    finishedProducts {
      id sku source quantity costPrice salePrice profitMargin barcode barcodeSvg tagsPrinted size createdAt
      itemType { id name }
      clothCategory { id name }
      clothColor { id name hexCode }
      warehouse { id name code }
    }
    salesOrders(limit: 100) {
      id orderNumber status paymentMode orderDate expectedDelivery actualDelivery
      subtotal discount totalAmount amountPaid amountDue notes createdAt
      buyer { id name phone }
      warehouse { id name code }
      items { id quantity unitPrice totalPrice finishedProduct { sku itemType { name } } }
    }
    creditTransactions(limit: 100) {
      id totalAmount amountPaid amountDue dueDate status createdAt
      buyer { id name phone }
      salesOrder { id orderNumber }
      payments { id amount paymentDate paymentMethod reference notes }
    }
    employees {
      id username email role phone active createdAt
      locations { id name code }
    }
    notifications { id title message level read link createdAt }
    buyerReturns {
      id returnNumber condition status reason createdAt quantity
      buyer { id name }
      finishedProduct { id sku itemType { name } }
      warehouse { id name }
    }
    supplierReturns {
      id returnNumber returnKind status reason metersReturned quantityReturned createdAt
      supplier { id name }
      rawClothBatch { id batchNumber }
      warehouse { id name }
    }
    allAuditLogs(limit: 500) {
      id entityType entityId action actorName detail createdAt
    }
    stockAdjustments(limit: 300) {
      id adjustmentNumber itemKind quantityChange adjustmentType reason createdAt
      rawClothBatch { id batchNumber clothCategory { name } clothColor { name } }
      finishedProduct { id sku itemType { name } }
      warehouse { id name }
    }
  }
`;
