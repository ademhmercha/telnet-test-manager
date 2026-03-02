export interface User {
  id: number;
  username: string;
  role: string;
}

export interface Poste {
  id: number;
  nom: string;
  description: string;
  statut: string;
}

export interface Produit {
  id: number;
  nom: string;
  posteId: number;
  description: string;
}

export interface Slot {
  id: number;
  nom: string;
  produitId: number;
  port: number;
  adresse: string;
}

export interface TestStep {
  step: number;
  description: string;
  status: 'PENDING' | 'SUCCESS' | 'FAIL';
  timestamp: string;
}

export interface TestResult {
  id: number;
  slotId: number;
  posteId: number;
  produitId: number;
  status: 'SUCCESS' | 'FAIL' | 'PENDING';
  startTime: string;
  endTime: string;
  steps: TestStep[];
  logs: string[];
}

export interface TestRunResponse {
  message: string;
  testId: number;
  steps: TestStep[];
  estimatedDuration: string;
}
