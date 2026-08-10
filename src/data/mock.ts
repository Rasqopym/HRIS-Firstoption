import type { StaffMember, PayrollRecord, AuditEntry, HRISNotification } from '../types'

export const DEPARTMENTS = [
  'Human Resources', 'Finance', 'Information Technology', 'Sales',
  'Marketing', 'Operations', 'Legal', 'Administration', 'Compliance',
]

export const BANKS = ['GTBank', 'First Bank', 'UBA', 'Zenith Bank', 'Access Bank', 'Polaris Bank', 'Sterling Bank']

export const staff: StaffMember[] = [
  {
    id: '1', staffId: 'FO-001', name: 'Chidi Okonkwo', email: 'c.okonkwo@firstoption.ng',
    role: 'superadmin', department: 'Administration', jobTitle: 'System Administrator',
    employmentDate: '2018-03-12', status: 'active', lastLogin: '2024-07-29 08:42',
    phone: '+234 801 234 5678', photo: 'https://i.pravatar.cc/150?img=52',
    bankName: 'GTBank', accountNumber: '0123456789',
    grossSalary: 650000, address: '14 Bourdillon Road, Ikoyi, Lagos',
    nextOfKin: 'Ada Okonkwo', nextOfKinPhone: '+234 802 345 6789', state: 'Lagos',
  },
  {
    id: '2', staffId: 'FO-002', name: 'Adeyemi Oluwaseun', email: 'a.oluwaseun@firstoption.ng',
    role: 'hr', department: 'Human Resources', jobTitle: 'HR Manager',
    employmentDate: '2019-06-03', status: 'active', lastLogin: '2024-07-29 09:15',
    phone: '+234 703 456 7890', photo: 'https://i.pravatar.cc/150?img=47',
    bankName: 'First Bank', accountNumber: '2034567890',
    grossSalary: 380000, address: '7 Allen Avenue, Ikeja, Lagos',
    nextOfKin: 'Bola Oluwaseun', nextOfKinPhone: '+234 704 567 8901', state: 'Lagos',
  },
  {
    id: '3', staffId: 'FO-003', name: 'Taiwo Adegoke', email: 't.adegoke@firstoption.ng',
    role: 'accountant', department: 'Finance', jobTitle: 'Senior Accountant',
    employmentDate: '2020-01-15', status: 'active', lastLogin: '2024-07-28 17:30',
    phone: '+234 805 678 9012', photo: 'https://i.pravatar.cc/150?img=33',
    bankName: 'Zenith Bank', accountNumber: '3045678901',
    grossSalary: 310000, address: '22 Awolowo Road, Ikoyi, Lagos',
    nextOfKin: 'Kehinde Adegoke', nextOfKinPhone: '+234 806 789 0123', state: 'Lagos',
  },
  {
    id: '4', staffId: 'FO-004', name: 'Ngozi Nwosu', email: 'n.nwosu@firstoption.ng',
    role: 'auditor', department: 'Compliance', jobTitle: 'Internal Auditor',
    employmentDate: '2020-08-22', status: 'active', lastLogin: '2024-07-29 10:05',
    phone: '+234 807 890 1234', photo: 'https://i.pravatar.cc/150?img=44',
    bankName: 'UBA', accountNumber: '4056789012',
    grossSalary: 290000, address: '5 Olu Obasanjo Road, Port Harcourt, Rivers',
    nextOfKin: 'Emeka Nwosu', nextOfKinPhone: '+234 808 901 2345', state: 'Rivers',
  },
  {
    id: '5', staffId: 'FO-005', name: 'Fatima Ibrahim', email: 'f.ibrahim@firstoption.ng',
    role: 'staff', department: 'Information Technology', jobTitle: 'Software Developer',
    employmentDate: '2021-02-08', status: 'active', lastLogin: '2024-07-29 08:55',
    phone: '+234 809 012 3456', photo: 'https://i.pravatar.cc/150?img=48',
    bankName: 'Access Bank', accountNumber: '5067890123',
    grossSalary: 340000, address: '12 Ahmadu Bello Way, Garki, Abuja',
    nextOfKin: 'Umar Ibrahim', nextOfKinPhone: '+234 810 123 4567', state: 'FCT',
  },
  {
    id: '6', staffId: 'FO-006', name: 'Emeka Obi', email: 'e.obi@firstoption.ng',
    role: 'staff', department: 'Sales', jobTitle: 'Sales Manager',
    employmentDate: '2019-11-18', status: 'active', lastLogin: '2024-07-28 16:20',
    phone: '+234 811 234 5678', photo: 'https://i.pravatar.cc/150?img=55',
    bankName: 'GTBank', accountNumber: '6078901234',
    grossSalary: 305000, address: '33 Onitsha Road, Nnewi, Anambra',
    nextOfKin: 'Chioma Obi', nextOfKinPhone: '+234 812 345 6789', state: 'Anambra',
  },
  {
    id: '7', staffId: 'FO-007', name: 'Amina Yusuf', email: 'a.yusuf@firstoption.ng',
    role: 'staff', department: 'Marketing', jobTitle: 'Marketing Executive',
    employmentDate: '2022-04-11', status: 'active', lastLogin: '2024-07-29 11:30',
    phone: '+234 813 456 7890', photo: 'https://i.pravatar.cc/150?img=41',
    bankName: 'First Bank', accountNumber: '7089012345',
    grossSalary: 215000, address: '8 Kano Road, Kaduna, Kaduna',
    nextOfKin: 'Aliyu Yusuf', nextOfKinPhone: '+234 814 567 8901', state: 'Kaduna',
  },
  {
    id: '8', staffId: 'FO-008', name: 'Babatunde Adewale', email: 'b.adewale@firstoption.ng',
    role: 'staff', department: 'Legal', jobTitle: 'Legal Officer',
    employmentDate: '2021-07-26', status: 'suspended', lastLogin: '2024-07-10 14:00',
    phone: '+234 815 678 9012', photo: 'https://i.pravatar.cc/150?img=60',
    bankName: 'Zenith Bank', accountNumber: '8090123456',
    grossSalary: 275000, address: '44 Ring Road, Ibadan, Oyo',
    nextOfKin: 'Femi Adewale', nextOfKinPhone: '+234 816 789 0123', state: 'Oyo',
  },
  {
    id: '9', staffId: 'FO-009', name: 'Chidinma Eze', email: 'c.eze@firstoption.ng',
    role: 'staff', department: 'Operations', jobTitle: 'Operations Coordinator',
    employmentDate: '2022-09-05', status: 'active', lastLogin: '2024-07-29 08:00',
    phone: '+234 817 890 1234', photo: 'https://i.pravatar.cc/150?img=45',
    bankName: 'UBA', accountNumber: '9001234567',
    grossSalary: 225000, address: '18 Oguta Road, Owerri, Imo',
    nextOfKin: 'Ikenna Eze', nextOfKinPhone: '+234 818 901 2345', state: 'Imo',
  },
  {
    id: '10', staffId: 'FO-010', name: 'Segun Afolabi', email: 's.afolabi@firstoption.ng',
    role: 'staff', department: 'Information Technology', jobTitle: 'IT Support Specialist',
    employmentDate: '2023-01-16', status: 'active', lastLogin: '2024-07-29 09:45',
    phone: '+234 819 012 3456', photo: 'https://i.pravatar.cc/150?img=53',
    bankName: 'Access Bank', accountNumber: '1012345678',
    grossSalary: 175000, address: '29 Agodi Road, Ibadan, Oyo',
    nextOfKin: 'Bisi Afolabi', nextOfKinPhone: '+234 820 123 4567', state: 'Oyo',
  },
  {
    id: '11', staffId: 'FO-011', name: 'Kemi Adeleke', email: 'k.adeleke@firstoption.ng',
    role: 'staff', department: 'Finance', jobTitle: 'Finance Analyst',
    employmentDate: '2021-05-20', status: 'active', lastLogin: '2024-07-28 18:00',
    phone: '+234 821 234 5678', photo: 'https://i.pravatar.cc/150?img=43',
    bankName: 'Polaris Bank', accountNumber: '2023456789',
    grossSalary: 248000, address: '6 Victoria Island, Lagos, Lagos',
    nextOfKin: 'Toyin Adeleke', nextOfKinPhone: '+234 822 345 6789', state: 'Lagos',
  },
  {
    id: '12', staffId: 'FO-012', name: 'Musa Abdullahi', email: 'm.abdullahi@firstoption.ng',
    role: 'staff', department: 'Sales', jobTitle: 'Business Development Officer',
    employmentDate: '2022-11-07', status: 'active', lastLogin: '2024-07-29 10:30',
    phone: '+234 823 456 7890', photo: 'https://i.pravatar.cc/150?img=57',
    bankName: 'Sterling Bank', accountNumber: '3034567890',
    grossSalary: 195000, address: '15 Hospital Road, Kano, Kano',
    nextOfKin: 'Halima Abdullahi', nextOfKinPhone: '+234 824 567 8901', state: 'Kano',
  },
  {
    id: '13', staffId: 'FO-013', name: 'Aisha Bello', email: 'a.bello@firstoption.ng',
    role: 'staff', department: 'Operations', jobTitle: 'Customer Relations Officer',
    employmentDate: '2023-03-20', status: 'active', lastLogin: '2024-07-29 11:00',
    phone: '+234 825 678 9012', photo: 'https://i.pravatar.cc/150?img=42',
    bankName: 'GTBank', accountNumber: '4045678901',
    grossSalary: 185000, address: '10 Independence Way, Kaduna, Kaduna',
    nextOfKin: 'Ibrahim Bello', nextOfKinPhone: '+234 826 789 0123', state: 'Kaduna',
  },
  {
    id: '14', staffId: 'FO-014', name: 'Uchenna Okeke', email: 'u.okeke@firstoption.ng',
    role: 'staff', department: 'Operations', jobTitle: 'Supply Chain Coordinator',
    employmentDate: '2020-10-14', status: 'offboarded', lastLogin: '2024-06-28 09:00',
    phone: '+234 827 890 1234', photo: 'https://i.pravatar.cc/150?img=56',
    bankName: 'First Bank', accountNumber: '5056789012',
    grossSalary: 220000, address: '3 Enugu Road, Onitsha, Anambra',
    nextOfKin: 'Nkechi Okeke', nextOfKinPhone: '+234 828 901 2345', state: 'Anambra',
  },
  {
    id: '15', staffId: 'FO-015', name: 'Tope Ogunleye', email: 't.ogunleye@firstoption.ng',
    role: 'staff', department: 'Administration', jobTitle: 'Executive Assistant',
    employmentDate: '2021-12-01', status: 'active', lastLogin: '2024-07-29 08:30',
    phone: '+234 829 012 3456', photo: 'https://i.pravatar.cc/150?img=46',
    bankName: 'UBA', accountNumber: '6067890123',
    grossSalary: 210000, address: '21 Broad Street, Lagos Island, Lagos',
    nextOfKin: 'Sade Ogunleye', nextOfKinPhone: '+234 830 123 4567', state: 'Lagos',
  },
]

export const payroll: PayrollRecord[] = staff
  .filter(s => s.status === 'active')
  .map(s => {
    const basic = Math.round(s.grossSalary * 0.6)
    const housing = Math.round(s.grossSalary * 0.2)
    const transport = Math.round(s.grossSalary * 0.1)
    const medical = Math.round(s.grossSalary * 0.1)
    const pension = Math.round(basic * 0.08)
    const nhf = Math.round(basic * 0.025)
    const paye = Math.round(s.grossSalary * 0.12)
    const netPay = s.grossSalary - pension - nhf - paye
    return {
      staffId: s.staffId,
      name: s.name,
      department: s.department,
      grossSalary: s.grossSalary,
      basicSalary: basic,
      housingAllowance: housing,
      transportAllowance: transport,
      medicalAllowance: medical,
      pension,
      nhf,
      paye,
      netPay,
      status: s.id === '3' ? 'processed' : s.id === '2' ? 'paid' : 'pending',
    } as PayrollRecord
  })

export const auditLog: AuditEntry[] = [
  {
    id: 'A001', user: 'Adeyemi Oluwaseun', role: 'HR', action: 'CREATE',
    entity: 'Staff', entityId: 'FO-015', timestamp: '2024-07-29 09:15:22',
    details: 'Created new staff record for Tope Ogunleye (Executive Assistant)',
    before: '', after: 'status=active, department=Administration', severity: 'low',
  },
  {
    id: 'A002', user: 'Taiwo Adegoke', role: 'Accountant', action: 'EXPORT',
    entity: 'Payroll', entityId: 'PAY-2024-07', timestamp: '2024-07-29 08:50:44',
    details: 'Exported July 2024 payroll report to PDF (13 records)',
    before: '', after: '', severity: 'medium',
  },
  {
    id: 'A003', user: 'Chidi Okonkwo', role: 'Super Admin', action: 'UPDATE',
    entity: 'Staff', entityId: 'FO-008', timestamp: '2024-07-28 16:30:11',
    details: 'Updated status for Babatunde Adewale',
    before: 'status=active', after: 'status=suspended', severity: 'high',
  },
  {
    id: 'A004', user: 'Ngozi Nwosu', role: 'Auditor', action: 'VIEW',
    entity: 'Payroll', entityId: 'PAY-2024-06', timestamp: '2024-07-28 14:20:33',
    details: 'Viewed June 2024 payroll records',
    before: '', after: '', severity: 'low',
  },
  {
    id: 'A005', user: 'Adeyemi Oluwaseun', role: 'HR', action: 'UPDATE',
    entity: 'Staff', entityId: 'FO-005', timestamp: '2024-07-28 11:05:18',
    details: 'Updated bank details for Fatima Ibrahim',
    before: 'accountNumber=5067890120', after: 'accountNumber=5067890123', severity: 'high',
  },
  {
    id: 'A006', user: 'Chidi Okonkwo', role: 'Super Admin', action: 'CREATE',
    entity: 'User', entityId: 'FO-014', timestamp: '2024-07-27 10:15:00',
    details: 'Created user account for Uchenna Okeke',
    before: '', after: 'role=staff, department=Operations', severity: 'medium',
  },
  {
    id: 'A007', user: 'Taiwo Adegoke', role: 'Accountant', action: 'UPDATE',
    entity: 'Payroll', entityId: 'PAY-2024-07', timestamp: '2024-07-27 09:30:55',
    details: 'Processed payroll for Adeyemi Oluwaseun — July 2024',
    before: 'status=pending', after: 'status=paid', severity: 'medium',
  },
  {
    id: 'A008', user: 'Adeyemi Oluwaseun', role: 'HR', action: 'DELETE',
    entity: 'Document', entityId: 'DOC-042', timestamp: '2024-07-26 15:44:09',
    details: 'Deleted outdated employment contract (superseded version)',
    before: 'file=contract_v1.pdf', after: '', severity: 'medium',
  },
  {
    id: 'A009', user: 'Fatima Ibrahim', role: 'Staff', action: 'LOGIN',
    entity: 'System', entityId: 'SYS', timestamp: '2024-07-29 08:55:01',
    details: 'Successful login from IP 105.112.44.22 (Lagos, NG)',
    before: '', after: '', severity: 'low',
  },
  {
    id: 'A010', user: 'Ngozi Nwosu', role: 'Auditor', action: 'CREATE',
    entity: 'Flag', entityId: 'FLG-007', timestamp: '2024-07-25 13:10:28',
    details: 'Flagged payroll variance for Finance dept — July vs June delta > 15%',
    before: '', after: 'status=open, assigned=Taiwo Adegoke', severity: 'high',
  },
]

export const notifications: HRISNotification[] = [
  {
    id: 'N1', title: 'Payroll Approved',
    message: "July 2024 payroll has been approved and is ready for disbursement.",
    timestamp: '2024-07-29 09:00', read: false, type: 'success',
  },
  {
    id: 'N2', title: 'New Flag Raised',
    message: 'Auditor Ngozi Nwosu flagged a payroll variance in Finance dept.',
    timestamp: '2024-07-25 13:10', read: false, type: 'warning',
  },
  {
    id: 'N3', title: 'Staff Account Suspended',
    message: "Babatunde Adewale's account has been suspended by the Super Admin.",
    timestamp: '2024-07-28 16:30', read: false, type: 'error',
  },
  {
    id: 'N4', title: 'New Staff Onboarded',
    message: 'Tope Ogunleye has completed the onboarding checklist.',
    timestamp: '2024-07-29 09:15', read: true, type: 'info',
  },
  {
    id: 'N5', title: 'Document Expiry Alert',
    message: "3 staff members' ID cards expire within 30 days.",
    timestamp: '2024-07-28 08:00', read: true, type: 'warning',
  },
]

export const currentUser = {
  superadmin: staff[0],
  hr: staff[1],
  accountant: staff[2],
  auditor: staff[3],
  staff: staff[4],
}

export function fmt(amount: number) {
  return '₦' + amount.toLocaleString('en-NG')
}
