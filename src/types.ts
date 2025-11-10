// Customer types
export interface Customer {
  id?: number;
  name: string;
  descriptors: number[][];
}

// Face recognition types
export interface FaceDetection {
  descriptor: Float32Array;
  confidence: number;
}

export interface MatchResult {
  customer: Customer;
  distance: number;
}

// API Response types
export interface CheckinResult {
  success: boolean;
  customer?: {
    name: string;
    confidence: number;
  };
  message: string;
}

export interface RegisterResult {
  message: string;
  customer: string;
}

export interface CustomersResponse {
  customers: Customer[];
  total: number;
}
