# PropOS Testing Checklist

## Phase 11 - Owner Intelligence

### Health Score
- [ ] Health score calculates correctly based on payment history
- [ ] Missed months deduct 15 points each
- [ ] Partial payments deduct 5 points each
- [ ] Late payments beyond 5-day grace deduct 2 points per day (max -20)
- [ ] Paid in advance adds 5 points
- [ ] 3 consecutive on-time months add 5 points
- [ ] Color coding works: Green (80-100), Blue (60-79), Amber (40-59), Red (0-39)
- [ ] Health score displays on Tenants list page
- [ ] Health score displays on Tenant Profile page

### Dashboard Insights
- [ ] Top 3 defaulters show highest balance owed
- [ ] Top 3 best tenants show lowest/negative balance
- [ ] Vacancy status shows correct count
- [ ] Revenue forecast shows next month's expected income

### Building Performance (Reports)
- [ ] Buildings ranked by collection rate
- [ ] Shows total income, expenses, and net profit per building

## Phase 13 - Documents

### Document Upload
- [ ] Upload modal opens correctly
- [ ] File selection works (PDF, JPG, PNG)
- [ ] Document name can be customized
- [ ] Document type selection works (lease, ID, receipt, photo, other)
- [ ] Entity type selection works (tenant, building, general)
- [ ] Entity selection populates correctly based on entity type
- [ ] Upload completes successfully
- [ ] Upload shows loading state

### Document List
- [ ] Documents display in table
- [ ] Document name and filename show correctly
- [ ] Document type badge displays
- [ ] Entity (tenant/building) name shows correctly
- [ ] File size displays correctly
- [ ] Upload date displays correctly

### Document Actions
- [ ] View button opens document in new tab
- [ ] Download button downloads file
- [ ] Delete button shows confirmation dialog
- [ ] Delete removes document from list
- [ ] Delete removes file from Firebase Storage

### Document Filters
- [ ] Entity type filter works (tenant/building/general)
- [ ] Entity filter works (specific tenant/building)
- [ ] Filter updates list correctly

## Core Functionality

### Authentication
- [ ] Login works with correct credentials
- [ ] Login fails with incorrect credentials
- [ ] Logout works correctly
- [ ] Session persists on refresh

### Buildings
- [ ] Add building works
- [ ] Edit building works
- [ ] Delete building works
- [ ] Building list displays correctly
- [ ] Building details show correctly

### Units
- [ ] Add unit works
- [ ] Edit unit works
- [ ] Delete unit works
- [ ] Unit list displays correctly
- [ ] Unit status (vacant/occupied) updates correctly

### Tenants
- [ ] Add tenant works
- [ ] Edit tenant works
- [ ] Delete tenant works
- [ ] Tenant list displays correctly
- [ ] Tenant profile shows correctly
- [ ] Tenant balance displays correctly
- [ ] Move-in date works correctly
- [ ] Opening balance works correctly

### Payments
- [ ] Add payment works
- [ ] Payment amount records correctly
- [ ] Payment date records correctly
- [ ] Payment method records correctly
- [ ] Payment updates tenant balance
- [ ] Payment list displays correctly

### Expenses
- [ ] Add expense works
- [ ] Expense amount records correctly
- [ ] Expense category works
- [ ] Expense list displays correctly

### Dashboard
- [ ] KPIs display correctly (Occupancy, Collection Rate, Arrears, Expected Rent)
- [ ] Charts render correctly
- [ ] Top arrears list displays correctly
- [ ] Recent payments list displays correctly

### Reports
- [ ] Profit & Loss report generates correctly
- [ ] Building Performance report generates correctly
- [ ] PDF export works

### Notifications
- [ ] WhatsApp message generation works
- [ ] Message preview displays correctly
- [ ] Bulk SMS works (if configured)

### Activity Log
- [ ] Activities log correctly
- [ ] Activity list displays correctly
- [ ] Activity filters work

### Maintenance
- [ ] Add maintenance job works
- [ ] Edit maintenance job works
- [ ] Update status works
- [ ] Maintenance list displays correctly

## UI/UX

### Responsive Design
- [ ] Layout works on desktop
- [ ] Layout works on tablet
- [ ] Layout works on mobile
- [ ] Sidebar toggles correctly on mobile

### Navigation
- [ ] All menu items work
- [ ] Back buttons work
- [ ] Page transitions are smooth

### Forms
- [ ] Form validation works
- [ ] Required fields are enforced
- [ ] Error messages display correctly
- [ ] Success messages display correctly

### Modals
- [ ] Modals open correctly
- [ ] Modals close correctly
- [ ] Modal backdrop click closes modal
- [ ] Modal content displays correctly

## Performance

### Load Times
- [ ] Initial page load is acceptable (< 3 seconds)
- [ ] Page navigation is fast
- [ ] Charts render quickly
- [ ] Data loads from Firebase quickly

### Firebase
- [ ] Real-time updates work correctly
- [ ] Data syncs across tabs
- [ ] No console errors related to Firebase
- [ ] Firestore queries execute correctly

## Browser Compatibility

- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Works in Edge

## Known Issues to Fix

List any issues found during testing:

1. 
2. 
3. 
