import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';


const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});


api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);


api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Ne déconnecter que pour les erreurs 401/403 sur les routes d'authentification
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Vérifier si l'URL n'est pas une route de rapport ou autre route non critique
      const requestUrl = error.config?.url || '';
      if (requestUrl.includes('/auth/') || requestUrl.includes('/login')) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);


export interface User {
  id: number;
  username: string;
  role: string;
  email: string;
  permissions: string[];
}

export interface LoginResponse {
  message: string;
  token: string;
  user: User;
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
  protocole?: string;
  description?: string;
  statut?: string;
}

export interface Reference {
  id: number;
  nom: string;
  produitId: number;
  description: string;
  version: string;
  statut: string;
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
  isMonitoring?: boolean;
}

export interface SequenceStep {
  commandId: string;
  expectedResponse?: string;
  timeout?: number;
  description?: string;
}

export const authService = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const response = await api.post('/login', { username, password });
    return response.data;
  },
};

export const posteService = {
  getPostes: async (): Promise<Poste[]> => {
    const response = await api.get('/postes');
    return response.data;
  },
  createPoste: async (data: Omit<Poste, 'id'>): Promise<{ poste: Poste }> => {
    const response = await api.post('/postes', data);
    return response.data;
  },
  updatePoste: async (id: number, data: Partial<Omit<Poste, 'id'>>): Promise<{ poste: Poste }> => {
    const response = await api.put(`/postes/${id}`, data);
    return response.data;
  },
  deletePoste: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/postes/${id}`);
    return response.data;
  },
};

export const produitService = {
  getProduits: async (posteId?: number): Promise<Produit[]> => {
    const params = posteId ? { posteId } : {};
    const response = await api.get('/produits', { params });
    return response.data;
  },
  createProduit: async (data: Omit<Produit, 'id'>): Promise<{ produit: Produit }> => {
    const response = await api.post('/produits', data);
    return response.data;
  },
  updateProduit: async (id: number, data: Partial<Omit<Produit, 'id'>>): Promise<{ produit: Produit }> => {
    const response = await api.put(`/produits/${id}`, data);
    return response.data;
  },
  deleteProduit: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/produits/${id}`);
    return response.data;
  },
};

export const slotService = {
  getSlots: async (produitId?: number): Promise<Slot[]> => {
    const params = produitId ? { produitId } : {};
    const response = await api.get('/slots', { params });
    return response.data;
  },
  createSlot: async (data: Omit<Slot, 'id'>): Promise<{ slot: Slot }> => {
    const response = await api.post('/slots', data);
    return response.data;
  },
  updateSlot: async (id: number, data: Partial<Omit<Slot, 'id'>>): Promise<{ slot: Slot }> => {
    const response = await api.put(`/slots/${id}`, data);
    return response.data;
  },
  deleteSlot: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/slots/${id}`);
    return response.data;
  },
};

export const referenceService = {
  getReferences: async (produitId?: number): Promise<Reference[]> => {
    const response = await api.get('/references', {
      params: produitId ? { produitId } : {}
    });
    return response.data;
  },
  createReference: async (data: Omit<Reference, 'id'>): Promise<{ reference: Reference }> => {
    const response = await api.post('/references', data);
    return response.data;
  },
  updateReference: async (id: number, data: Partial<Omit<Reference, 'id'>>): Promise<{ reference: Reference }> => {
    const response = await api.put(`/references/${id}`, data);
    return response.data;
  },
  deleteReference: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/references/${id}`);
    return response.data;
  },
};

export const testService = {
  runTest: async (
    slotId: number,
    posteId: number,
    produitId: number,
    commandId?: string,
    monitorDurationMs?: number
  ): Promise<TestRunResponse> => {
    const payload: any = { slotId, posteId, produitId, commandId };
    if (typeof monitorDurationMs === 'number' && monitorDurationMs > 0) {
      payload.monitorDurationMs = monitorDurationMs;
    }
    const response = await api.post('/run-test', payload);
    return response.data;
  },

  runTestSequence: async (slotId: number, posteId: number, produitId: number, commands: SequenceStep[]): Promise<TestRunResponse> => {
    const response = await api.post('/run-test', { slotId, posteId, produitId, commands });
    return response.data;
  },

  stopTest: async (testId: number): Promise<{ message: string; testId: number; status: string }> => {
    const response = await api.post('/stop-test', { testId });
    return response.data;
  },

  getTestResultById: async (id: number): Promise<TestResult> => {
    const response = await api.get(`/test-results/${id}`);
    return response.data;
  },
  
  getTestResults: async (filters?: {
    slotId?: number;
    posteId?: number;
    produitId?: number;
    limit?: number;
  }): Promise<TestResult[]> => {
    const response = await api.get('/test-results', { params: filters });
    return response.data;
  },
};

export const reportService = {
  getReports: async (): Promise<{ message: string; reports: any[]; total: number }> => {
    const response = await api.get('/reports');
    return response.data;
  },

  generateReport: async (slotId: number, posteId: number, produitId: number, startDate?: string, endDate?: string, statusFilter?: string): Promise<{ message: string; report: any }> => {
    const response = await api.post('/reports/generate', { slotId, posteId, produitId, startDate, endDate, statusFilter });
    return response.data;
  },

  getReportById: async (id: string): Promise<{ message: string; report: any }> => {
    const response = await api.get(`/reports/${id}`);
    return response.data;
  },

  deleteReport: async (id: string): Promise<{ message: string }> => {
    const response = await api.delete(`/reports/${id}`);
    return response.data;
  }
};

export interface AuditLog {
  timestamp: string;
  userId: number;
  username: string;
  action: string;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
}

export interface SystemLog {
  timestamp: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  component: string;
}

export interface SystemStats {
  totalTests: number;
  successfulTests: number;
  failedTests: number;
  pendingTests: number;
  totalUsers: number;
  activeUsers: number;
  systemUptime: number;
  lastTest: string | null;
}

export const adminService = {
  getAuditLogs: async (): Promise<{ message: string; logs: AuditLog[]; total: number }> => {
    const response = await api.get('/admin/audit-logs');
    return response.data;
  },

  getSystemLogs: async (): Promise<{ message: string; logs: SystemLog[]; total: number }> => {
    const response = await api.get('/admin/system-logs');
    return response.data;
  },

  getUsers: async (): Promise<{ message: string; users: User[]; total: number }> => {
    const response = await api.get('/admin/users');
    return response.data;
  },

  getStats: async (): Promise<{ message: string; stats: SystemStats }> => {
    const response = await api.get('/admin/stats');
    return response.data;
  },
};

export default api;
