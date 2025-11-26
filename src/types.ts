// Patient types
export interface Patient {
  PatientId: string;
  PatientName: string;
  Descriptor: number[][];
  SortOrder?: number;
}

// Face recognition types
export interface FaceDetection {
  descriptor: Float32Array;
  confidence: number;
}

export interface MatchResult {
  patient: Patient;
  distance: number;
}

// API Response types
export interface CheckinResult {
  success: boolean;
  patient?: {
    PatientName: string;
    PatientId: string;
    confidence: number;
  };
  message: string;
}

export interface RegisterResult {
  message: string;
  patient: string;
}

export interface PatientsResponse {
  patients: Patient[];
  total: number;
}
