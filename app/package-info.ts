import { version } from './package.json'
// Gait: product identity lives outside package.json to avoid upstream conflicts
import { bundleID, companyName, productName } from './gait-branding.json'

export function getProductName() {
  return process.env.NODE_ENV === 'development'
    ? `${productName}-dev`
    : productName
}

export function getCompanyName() {
  return companyName
}

export function getVersion() {
  return version
}

export function getBundleID() {
  return process.env.NODE_ENV === 'development' ? `${bundleID}Dev` : bundleID
}
