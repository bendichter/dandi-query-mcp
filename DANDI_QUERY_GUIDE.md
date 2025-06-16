# DANDI Query Framework Guide

This guide explains how to effectively use both the basic filtering and advanced SQL query frameworks for the DANDI Archive through the MCP server.

## Overview

The DANDI Query MCP Server provides two complementary approaches for querying DANDI data:

1. **Basic Search** - Simple, predefined filters for common queries
2. **SQL Queries** - Full SQL flexibility for complex analytical queries

## Quick Start

The MCP server provides these tools:
- `search_datasets` - Filter datasets with basic criteria
- `search_assets` - Filter assets/sessions with basic criteria  
- `execute_sql` - Run complex SQL queries
- `validate_sql` - Check SQL queries before execution
- `get_schema` - Explore database structure
- `get_filter_options` - See available filter values

## Basic Search Framework

### When to Use Basic Search
- Quick dataset discovery
- Simple filtering by species, anatomy, or approach
- Exploring available data without knowing SQL
- Prototype queries before writing complex SQL

### Available Filters

#### Dataset Filters (`search_datasets`)
```json
{
  "name": "mouse",                           // Search in dataset names
  "description": "hippocampus",              // Search in descriptions
  "species": ["Mus musculus"],               // Filter by species
  "approach": ["electrophysiology"],         // Experimental approach
  "measurement_technique": ["extracellular electrophysiology"],
  "anatomy": ["hippocampus", "cortex"],      // Anatomical regions
  "limit": 20,                               // Max results (1-100)
  "offset": 0                                // Pagination offset
}
```

#### Asset Filters (`search_assets`)
```json
{
  "dandiset_id": 124,                        // Specific dataset
  "variable_measured": ["ElectricalSeries"], // Data types
  "session_type": ["behavioral"],            // Session types
  "species": ["Mus musculus"],               // Subject species
  "limit": 50,
  "offset": 0
}
```

### Basic Search Examples

#### Find Mouse Electrophysiology Datasets
```json
{
  "tool": "search_datasets",
  "params": {
    "species": ["Mus musculus"],
    "approach": ["electrophysiology"],
    "limit": 20
  }
}
```

#### Get All Assets from a Specific Dataset
```json
{
  "tool": "search_assets", 
  "params": {
    "dandiset_id": 124,
    "limit": 100
  }
}
```

#### Find ElectricalSeries Data
```json
{
  "tool": "search_assets",
  "params": {
    "variable_measured": ["ElectricalSeries"],
    "species": ["Mus musculus"],
    "limit": 50
  }
}
```

## SQL Query Framework

### When to Use SQL Queries
- Complex analytical questions
- Multi-table joins and aggregations
- Custom filtering logic
- Statistical analysis across datasets
- Data quality assessment

### Security Features
- ✅ Only SELECT queries allowed
- ✅ Access limited to DANDI tables
- ✅ SQL injection prevention
- ✅ Query complexity limits
- ✅ Automatic result limits (1000 rows max)

### Available Tables

#### Core Tables
```sql
-- Dataset metadata (Dandiset model)
dandisets_dandiset (
  id, dandi_id, identifier, base_id, version, version_order, is_draft, is_latest,
  name, description, date_created, date_modified, date_published, 
  license, citation, url, repository, doi, keywords, study_target,
  created_at, updated_at
)

-- Individual files/assets (Asset model)  
dandisets_asset (
  id, dandi_asset_id, identifier, path, content_size, encoding_format,
  date_modified, date_published, blob_date_modified, digest, content_url,
  variable_measured, created_at, updated_at
)

-- Subject/participant information (Participant model)
dandisets_participant (
  id, identifier, species_id, sex_id, age, strain_id
)

-- Relationship tables
dandisets_assetdandiset (asset_id, dandiset_id, date_added, is_primary)
dandisets_assetwasattributedto (asset_id, participant_id)

-- Reference tables  
dandisets_speciestype (id, identifier, name)
dandisets_anatomy (id, identifier, name) 
dandisets_approachtype (id, identifier, name)
dandisets_measurementtechniquetype (id, identifier, name)
dandisets_sextype (id, identifier, name)
dandisets_straintype (id, identifier, name)
dandisets_disorder (id, identifier, name, dx_date)

-- Additional relationship tables
dandisets_assetapproach (asset_id, approach_id)
dandisets_assetmeasurementtechnique (asset_id, measurement_technique_id)
dandisets_dandisetcontributor (dandiset_id, contributor_id)
dandisets_dandisetabout (dandiset_id, disorder_id, anatomy_id, generic_type_id)

-- Summary and metadata tables
dandisets_assetssummary (
  id, number_of_bytes, number_of_files, number_of_subjects, 
  number_of_samples, number_of_cells, variable_measured
)
dandisets_contributor (id, identifier, name, email, url, role_name, include_in_citation)
dandisets_activity (id, identifier, name, description, start_date, end_date, schema_key)
```

### SQL Query Examples

#### Simple Dataset Search
```sql
SELECT id, name, description 
FROM dandisets_dandiset 
WHERE name ILIKE '%mouse%' 
ORDER BY name 
LIMIT 20
```

#### Count Datasets by Species
```sql
SELECT s.genus_species, COUNT(DISTINCT d.id) as dataset_count
FROM dandisets_dandiset d 
JOIN dandisets_assetdandiset ad ON d.id = ad.dandiset_id
JOIN dandisets_asset a ON ad.asset_id = a.id
JOIN dandisets_assetwasattributedto awo ON a.id = awo.asset_id
JOIN dandisets_participant p ON awo.participant_id = p.id
JOIN dandisets_species s ON p.species_id = s.id
GROUP BY s.genus_species
ORDER BY dataset_count DESC
```

#### Complex Analysis: Multi-Subject, Multi-Session Datasets
```sql
SELECT d.id, d.name, qualified_subjects.subject_count 
FROM dandisets_dandiset d 
JOIN (
    SELECT sessions_per_subject.dandiset_id, 
           COUNT(DISTINCT sessions_per_subject.participant_id) as subject_count
    FROM (
        SELECT ad.dandiset_id, awo.participant_id, COUNT(*) as session_count
        FROM dandisets_asset a 
        JOIN dandisets_assetdandiset ad ON a.id = ad.asset_id
        JOIN dandisets_assetwasattributedto awo ON a.id = awo.asset_id
        WHERE UPPER(a.variable_measured::text) LIKE UPPER('%ElectricalSeries%')
        GROUP BY ad.dandiset_id, awo.participant_id
        HAVING COUNT(*) >= 3  -- At least 3 sessions per subject
    ) sessions_per_subject
    GROUP BY sessions_per_subject.dandiset_id
    HAVING COUNT(DISTINCT sessions_per_subject.participant_id) >= 3  -- At least 3 subjects
) qualified_subjects ON d.id = qualified_subjects.dandiset_id
ORDER BY qualified_subjects.subject_count DESC
```

#### Variable Measurement Analysis
```sql
SELECT 
    a.variable_measured,
    COUNT(*) as asset_count,
    COUNT(DISTINCT ad.dandiset_id) as dataset_count
FROM dandisets_asset a
JOIN dandisets_assetdandiset ad ON a.id = ad.asset_id
WHERE a.variable_measured IS NOT NULL
GROUP BY a.variable_measured
ORDER BY asset_count DESC
LIMIT 20
```

## Choosing the Right Approach

### Use Basic Search When:
- **Quick exploration**: "Show me mouse datasets"
- **Simple filters**: Single criteria filtering
- **Prototyping**: Testing ideas before complex queries
- **Non-technical users**: Predefined, safe operations

### Use SQL Queries When:
- **Complex logic**: Multiple conditions, OR/AND logic
- **Aggregations**: Counting, summing, statistical analysis
- **Multi-table joins**: Combining data across relationships
- **Custom analysis**: Unique analytical requirements

## Best Practices

### Basic Search Best Practices
1. **Start broad, then narrow**: Begin with fewer filters
2. **Use pagination**: Set appropriate limits and offsets
3. **Check filter options**: Use `get_filter_options` to see valid values
4. **Combine complementary filters**: Species + anatomy + approach

### SQL Query Best Practices
1. **Always use LIMIT**: Prevent accidentally large result sets
2. **Filter early**: Use WHERE clauses to reduce data before JOINs
3. **Test with validate_sql**: Check syntax before execution
4. **Use indexes wisely**: Filter on id, name, created_at fields when possible
5. **Build incrementally**: Start simple, add complexity gradually

### Performance Tips
1. **Basic search is faster** for simple queries
2. **SQL is more efficient** for complex multi-table operations
3. **Use EXPLAIN** (in validate_sql) to understand query plans
4. **Index-friendly WHERE clauses** improve performance

## Common Use Cases

### Dataset Discovery
```bash
# Basic approach
search_datasets: {"species": ["Mus musculus"], "approach": ["electrophysiology"]}

# SQL approach  
"SELECT id, name FROM dandisets_dandiset WHERE name ILIKE '%electrophysiology%'"
```

### Cross-Dataset Analysis
```bash
# This requires SQL - no basic search equivalent
"SELECT approach.name, COUNT(*) FROM dandisets_approach approach 
 JOIN dandisets_dandisetapproach da ON approach.id = da.approach_id 
 GROUP BY approach.name ORDER BY COUNT(*) DESC"
```

### Data Quality Assessment
```bash
# SQL is needed for complex logic
"SELECT 
   COUNT(*) as total_assets,
   COUNT(variable_measured) as assets_with_variables,
   COUNT(*) - COUNT(variable_measured) as missing_variables
 FROM dandisets_asset"
```

## Error Handling

Both frameworks provide detailed error messages:

### Basic Search Errors
- Invalid filter values (check with `get_filter_options`)
- Limit/offset out of range
- Network/API errors

### SQL Query Errors
- Syntax errors with specific line numbers
- Security violations (non-SELECT statements)
- Table access restrictions
- Query complexity limits exceeded

## Resources and Documentation

The MCP server provides built-in documentation:
- `dandi://docs/basic-search` - Basic search guide
- `dandi://docs/sql-queries` - SQL query reference
- `dandi://docs/schema` - Database schema details
- `dandi://examples/basic` - Basic search examples
- `dandi://examples/sql` - SQL query examples

## Getting Help

1. **Explore schema**: Use `get_schema` to understand table structure
2. **Check examples**: Review built-in examples for patterns
3. **Start simple**: Begin with basic search, progress to SQL
4. **Validate first**: Always test SQL queries with `validate_sql`
5. **Use limits**: Always include LIMIT clauses in SQL queries

This dual approach gives you both ease-of-use for common queries and full power for complex analysis!
