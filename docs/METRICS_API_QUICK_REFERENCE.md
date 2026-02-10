# Metrics Collection API - Quick Reference

## Endpoint

```
POST /api/metrics/collect
```

## Current Period Product Metrics

### Request

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

### Response

```json
{
	"success": true,
	"message": "Metrics collected successfully",
	"data": {
		"todayProducts": 12, // Products created today
		"thisWeekProducts": 45, // Products created this week
		"thisMonthProducts": 189, // Products created this month
		"thisQuarterProducts": 567, // Products created this quarter
		"thisYearProducts": 2456 // Products created this year
	}
}
```

## Rolling Period Metrics (Last N Days)

### Request

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

### Response

```json
{
	"success": true,
	"message": "Metrics collected successfully",
	"data": {
		"weeklyProducts": 45, // Products created in last 7 days
		"monthlyProducts": 189, // Products created in last 30 days
		"annualProducts": 2456 // Products created in last 365 days
	}
}
```

## Other Common Examples

### User Count by Status

```json
{
	"model": "User",
	"data": ["count", "byStatus"],
	"filter": {
		"isActive": true
	}
}
```

**Response:**

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

### Product Stock Status

```json
{
	"model": "Product",
	"data": ["stockStatus"]
}
```

**Response:**

```json
{
	"success": true,
	"message": "Metrics collected successfully",
	"data": {
		"stockStatus": {
			"inStock": 350,
			"lowStock": 100,
			"outOfStock": 50
		}
	}
}
```

### Transaction Aggregations

```json
{
	"model": "Transaction",
	"data": ["count", "sum"],
	"filter": {
		"status": "completed",
		"dateFrom": "2025-01-01"
	}
}
```

**Response:**

```json
{
	"success": true,
	"message": "Metrics collected successfully",
	"data": {
		"count": 1200,
		"sum": {
			"amount": 125000.5
		}
	}
}
```

## Available Data Types

| Data Type           | Description                | Works On                          |
| ------------------- | -------------------------- | --------------------------------- |
| `count`             | Total record count         | All models                        |
| `sum`               | Sum of numeric fields      | Models with amount/quantity/price |
| `average`           | Average of numeric fields  | Models with amount/quantity/price |
| `byStatus`          | Group by status field      | Models with status field          |
| `stockStatus`       | Stock levels breakdown     | Product model                     |
| `resolved`          | Resolved vs unresolved     | Alert model                       |
| **Current Period**  |                            |                                   |
| `today[Name]`       | Count created today        | All models                        |
| `thisWeek[Name]`    | Count created this week    | All models                        |
| `thisMonth[Name]`   | Count created this month   | All models                        |
| `thisQuarter[Name]` | Count created this quarter | All models                        |
| `thisYear[Name]`    | Count created this year    | All models                        |
| **Rolling Period**  |                            |                                   |
| `weekly[Name]`      | Count from last 7 days     | All models                        |
| `monthly[Name]`     | Count from last 30 days    | All models                        |
| `annual[Name]`      | Count from last 365 days   | All models                        |

## Filter Options

| Filter     | Type              | Description                     |
| ---------- | ----------------- | ------------------------------- |
| `dateFrom` | Date (YYYY-MM-DD) | Start date for createdAt filter |
| `dateTo`   | Date (YYYY-MM-DD) | End date for createdAt filter   |
| `isActive` | Boolean           | Filter active/inactive records  |
| `status`   | String            | Filter by status value          |
| Any field  | Any type          | Filter by any model field       |

## Tips

1. **Model names are case-insensitive**: Use "Product", "product", or "PRODUCT"
2. **One model per request**: Focus on specific metrics for a single model
3. **Combine multiple data types**: Request multiple metrics in one call
4. **Date filters**: Use `dateFrom` and `dateTo` in the filter object
5. **Current period metrics**: Use "today", "thisWeek", "thisMonth", "thisQuarter", "thisYear"
6. **Rolling period metrics**: Use "weekly", "monthly", "annual" for last N days
7. **Quarters**: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
