import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import { installGlobalErrorLogging } from './utils/appLog.js'
import { StoreSettingsProvider } from './context/StoreSettingsContext.jsx'
import { CashRegisterProvider } from './context/CashRegisterContext.jsx'
import { AccessControlProvider } from './context/AccessControlContext.jsx'
import { ManagerAuthProvider } from './context/ManagerAuthContext.jsx'
import { SessionProvider } from './context/SessionContext.jsx'
import { OperatorsProvider } from './context/OperatorsContext.jsx'
import { SuppliersProvider } from './context/SuppliersContext.jsx'
import { PendingSaleProvider } from './context/PendingSaleContext.jsx'
import { ProductsProvider } from './context/ProductsContext.jsx'
import { ClientsProvider } from './context/ClientsContext.jsx'
import { DeliveryProvider } from './context/DeliveryContext.jsx'
import { OnboardingProvider } from './context/OnboardingContext.jsx'

installGlobalErrorLogging()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <StoreSettingsProvider>
        <OperatorsProvider>
          <SessionProvider>
            <AccessControlProvider>
              <ManagerAuthProvider>
                <CashRegisterProvider>
                  <SuppliersProvider>
                    <ProductsProvider>
                      <ClientsProvider>
                        <DeliveryProvider>
                          <PendingSaleProvider>
                            <OnboardingProvider>
                              <App />
                            </OnboardingProvider>
                          </PendingSaleProvider>
                        </DeliveryProvider>
                      </ClientsProvider>
                    </ProductsProvider>
                  </SuppliersProvider>
                </CashRegisterProvider>
              </ManagerAuthProvider>
            </AccessControlProvider>
          </SessionProvider>
        </OperatorsProvider>
      </StoreSettingsProvider>
    </ErrorBoundary>
  </StrictMode>,
)
