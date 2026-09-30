// Only students from these university email domains may sign up (proposal must-have #1).
export const UNIVERSITIES = [
  { code: 'HKU', name: 'The University of Hong Kong', domains: ['connect.hku.hk', 'hku.hk'] },
  { code: 'CUHK', name: 'The Chinese University of Hong Kong', domains: ['link.cuhk.edu.hk', 'cuhk.edu.hk'] },
  { code: 'PolyU', name: 'The Hong Kong Polytechnic University', domains: ['connect.polyu.hk', 'polyu.edu.hk'] },
]

export function getUniversityFromEmail(email) {
  const domain = email.trim().toLowerCase().split('@')[1]
  return UNIVERSITIES.find((university) => university.domains.includes(domain)) ?? null
}
