# Metrics Collection Endpoint

## Overview

The metrics collection endpoint allows you to collect aggregated data from a single model per request with flexible filtering options and custom metric types.

## Endpoint

**POST** `/api/metrics/collect`

## Authentication

Requires Bearer Token authentication.

## Request Body Schema

```json
{
	"model": "string", // Required: Model name (e.g., "Product", "User", "Alert")
	"data": ["string"], // Required: Array of data types to collect
	"filter": {
		// Optional: Filter conditions
		"dateFrom": "2025-01-01", // Optional: Start date
		"dateTo": "2025-12-31" // Optional: End date
		// ... any other model-specific filters
	}
}
```

## Available Data Types

### Standard Metrics

- **count**: Total count of records
- **sum**: Sum of numeric fields (amount, quantity, total, price)
- **average**: Average of numeric fields
- **min**: Minimum values of fields
- **max**: Maximum values of fields
- **byStatus**: Group count by status field
- **stockStatus**: Stock levels (inStock, lowStock, outOfStock) - for products
- **resolved**: Resolved vs unresolved count - for alerts

### Time-Based Metrics (Custom)

You can use custom metric names that include time periods:

**Current Period Metrics:**

- **today[ModelName]**: Count of records created today (since midnight)
- **thisWeek[ModelName]**: Count of records created this week (since Monday)
- **thisMonth[ModelName]**: Count of records created this month (since 1st)
- **thisQuarter[ModelName]**: Count of records created this quarter (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec)
- **thisYear[ModelName]**: Count of records created this year (since January 1st)

**Rolling Period Metrics (Last N Days):**

- **weekly[ModelName]**: Count of records from the last 7 days
- **monthly[ModelName]**: Count of records from the last 30 days
- **annual[ModelName]**: Count of records from the last 365 days

Examples: `todayProducts`, `thisWeekUsers`, `thisMonthOrders`, `thisQuarterSales`, `weeklyProducts`, `monthlyTransactions`

### Field-Based Grouping

Any field name can be used as a data type to group by that field.

## Example Requests

### Current Period Product Metrics

```json
{
	"model": "Product",
	"data": [
		"todayProducts",
		"thisWeekProducts",
		"thisMonthProducts",
		"thisQuarterProducts",
		"thisYearProducts"
	],
	"filter": {
		"isActive": true
	}
}
```

### Rolling Period Metrics

```json
{
	"model": "Product",
	"data": ["weeklyProducts", "monthlyProducts", "annualProducts"],
	"filter": {
		"dateFrom": "2025-01-01",
		"dateTo": "2025-12-31"
	}
}
```

### User Metrics with Filters

```json
{
	"model": "User",
	"data": ["count", "byStatus"],
	"filter": {
		"isActive": true,
		"dateFrom": "2025-01-01",
		"dateTo": "2025-12-31"
	}
}
```

### Product Stock Status

```json
{
	"model": "Product",
	"data": ["count", "stockStatus", "sum"],
	"filter": {
		"categoryId": "507f1f77bcf86cd799439011"
	}
}
```

### Alert Resolution Status

```json
{
	"model": "Alert",
	"data": ["count", "resolved"],
	"filter": {
		"dateFrom": "2025-01-01",
		"dateTo": "2025-12-31"
	}
}
```

### Transaction Aggregations

```json
{
	"model": "Transaction",
	"data": ["count", "sum", "average"],
	"filter": {
		"status": "completed",
		"dateFrom": "2025-01-01",
		"dateTo": "2025-12-31"
	}
}
```

## Example Responses

### Current Period Metrics Response

```json
{
	"success": true,
	"message": "Metrics collected successfully",
	"data": {
		"todayProducts": 12,
		"thisWeekProducts": 45,
		"thisMonthProducts": 189,
		"thisQuarterProducts": 567,
		"thisYearProducts": 2456
	}
}
```

### Rolling Period Metrics Response

```json
{
	"success": true,
	"message": "Metrics collected successfully",
	"data": {
		"weeklyProducts": 45,
		"monthlyProducts": 189,
		"annualProducts": 2456
	}
}
```

### User Metrics Response

```json
{
	"success": true,
	"message": "Metrics collected successfully",
	"data": {
		"count": 150,
		"byStatus": {
			"active": 120,
			"inactive": 30
		}
	}
}
```

### Product Stock Status Response

```json
{
	"success": true,
	"message": "Metrics collected successfully",
	"data": {
		"count": 500,
		"stockStatus": {
			"inStock": 350,
			"lowStock": 100,
			"outOfStock": 50
		},
		"sum": {
			"quantity": 15000,
			"price": 45000.0
		}
	}
}
```

### Transaction Aggregation Response

```json
{
	"success": true,
	"message": "Metrics collected successfully",
	"data": {
		"count": 1200,
		"sum": {
			"amount": 125000.5,
			"quantity": 3500
		},
		"average": {
			"amount": 104.17
		}
	}
}
```

## Filtering Options

### Date Filters

- **dateFrom**: Date string (YYYY-MM-DD) - Start date for filtering records
- **dateTo**: Date string (YYYY-MM-DD) - End date for filtering records

These filters apply to the `createdAt` field of the model.

### Common Model Filters

You can include any model-specific filter in the filter object:

- **isActive**: Boolean - Filter by active status
- **status**: String - Filter by status field
- **categoryId**: String - Filter by category ID
- **departmentId**: String - Filter by department ID
- Any other field on the model

**Note**: `isDeleted: false` is automatically applied to all queries.

### Example with Multiple Filters

```json
{
	"model": "Product",
	"data": ["count", "stockStatus"],
	"filter": {
		"dateFrom": "2025-01-01",
		"dateTo": "2025-12-31",
		"isActive": true,
		"categoryId": "507f1f77bcf86cd799439011"
	}
}
```

## Error Handling

### Model Not Found Error

```json
{
	"success": false,
	"message": "Failed to collect metrics: Model \"InvalidModel\" not found",
	"statusCode": 400
}
```

### Validation Error

```json
{
	"success": false,
	"message": "Validation failed",
	"statusCode": 400,
	"errors": {
		"model": ["Model name is required"],
		"data": ["At least one data type is required"]
	}
}
```

## Use Cases

1. **Time-Based Product Tracking**: Track weekly, monthly, and annual product counts
2. **Dashboard Widgets**: Generate single-model metrics for dashboard cards
3. **Stock Monitoring**: Monitor product stock levels and status
4. **User Activity**: Track user counts and status distributions
5. **Alert Management**: Monitor resolved vs unresolved alerts
6. **Transaction Analytics**: Aggregate transaction amounts and counts
7. **Filtered Reports**: Generate reports with specific date ranges and filters

## Notes

- **Model names are case-insensitive**: "Product", "product", and "PRODUCT" all work
- **Automatic filtering**: All queries automatically exclude deleted records (`isDeleted: false`)
- **Date filtering**: Uses the `createdAt` field by default
- **Flexible data types**:
    - Standard types: count, sum, average, min, max, byStatus, stockStatus, resolved
    - Time-based: Any metric name containing "weekly", "monthly", or "annual"
    - Field-based: Any model field name can be used for grouping
- **Numeric aggregations**: Sum, average, min, and max operations work on common numeric fields (amount, quantity, total, price)
- **Graceful handling**: If a field doesn't exist on a model, it will be silently skipped
- **One model per request**: Each request collects metrics from a single model

## Time-Based Metrics Calculation

### Current Period Metrics

Calculate counts for the current time period:

- **Today**: Records created today (from 00:00:00 to now)
- **This Week**: Records created this week (from Monday 00:00:00 to now)
- **This Month**: Records created this month (from 1st 00:00:00 to now)
- **This Quarter**: Records created this quarter
    - Q1: January 1 - March 31
    - Q2: April 1 - June 30
    - Q3: July 1 - September 30
    - Q4: October 1 - December 31
- **This Year**: Records created this year (from January 1 00:00:00 to now)

### Rolling Period Metrics (Last N Days)

Calculate counts for the last N days from now:

- **Weekly**: Records created in the last 7 days from now
- **Monthly**: Records created in the last 30 days from now
- **Annual**: Records created in the last 365 days from now

**Note**: Time-based metrics are independent of the `dateFrom` and `dateTo` filters, which apply to all other metric types.
