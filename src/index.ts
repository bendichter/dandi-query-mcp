#!/usr/bin/env node

/**
 * DANDI Query Server - MCP server for querying DANDI Archive data
 * 
 * This MCP server provides tools for both basic filtering and advanced SQL queries
 * against the DANDI Archive database. It supports:
 * - Basic search with filters for datasets and assets
 * - Advanced SQL queries with security validation
 * - Schema discovery and documentation
 * - Query examples and best practices
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

// Configuration
const DANDI_API_BASE = process.env.DANDI_API_BASE || "http://localhost:8000";
const API_TIMEOUT = 30000; // 30 seconds

interface DandiSearchParams {
  name?: string;
  description?: string;
  species?: string[];
  approach?: string[];
  measurement_technique?: string[];
  anatomy?: string[];
  disorder?: string[];
  session_type?: string[];
  variable_measured?: string[];
  dandiset_id?: number;
  limit?: number;
  offset?: number;
}

interface SqlQueryParams {
  sql: string;
}

interface SchemaQueryParams {
  table?: string;
}

/**
 * DANDI Query Server implementation
 */
class DandiQueryServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: "dandi-query-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: DANDI_API_BASE,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupResourceHandlers();
    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Setup resource handlers for documentation and examples
   */
  private setupResourceHandlers() {
    // List available documentation resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "dandi://docs/basic-search",
          name: "Basic Search Guide",
          mimeType: "text/markdown",
          description: "Guide to using the basic search functionality with filters"
        },
        {
          uri: "dandi://docs/sql-queries",
          name: "SQL Query Guide", 
          mimeType: "text/markdown",
          description: "Guide to writing advanced SQL queries with examples"
        },
        {
          uri: "dandi://docs/schema",
          name: "Database Schema Reference",
          mimeType: "text/markdown", 
          description: "Complete reference of available tables and fields"
        },
        {
          uri: "dandi://examples/basic",
          name: "Basic Search Examples",
          mimeType: "application/json",
          description: "Collection of example basic search queries"
        },
        {
          uri: "dandi://examples/sql",
          name: "SQL Query Examples",
          mimeType: "application/json",
          description: "Collection of example SQL queries for common use cases"
        }
      ],
    }));

    // Handle resource reading
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const url = new URL(request.params.uri);
      const path = url.pathname;

      switch (path) {
        case "/docs/basic-search":
          return {
            contents: [{
              uri: request.params.uri,
              mimeType: "text/markdown",
              text: this.getBasicSearchGuide()
            }]
          };

        case "/docs/sql-queries":
          return {
            contents: [{
              uri: request.params.uri,
              mimeType: "text/markdown", 
              text: this.getSqlQueryGuide()
            }]
          };

        case "/docs/schema":
          return {
            contents: [{
              uri: request.params.uri,
              mimeType: "text/markdown",
              text: this.getSchemaGuide()
            }]
          };

        case "/examples/basic":
          return {
            contents: [{
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(this.getBasicSearchExamples(), null, 2)
            }]
          };

        case "/examples/sql":
          return {
            contents: [{
              uri: request.params.uri,
              mimeType: "application/json", 
              text: JSON.stringify(this.getSqlQueryExamples(), null, 2)
            }]
          };

        default:
          throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${path}`);
      }
    });
  }

  /**
   * Setup tool handlers for query functionality
   */
  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_datasets",
          description: "Search DANDI datasets using basic filters",
          inputSchema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Search in dataset names"
              },
              description: {
                type: "string", 
                description: "Search in dataset descriptions"
              },
              species: {
                type: "array",
                items: { type: "string" },
                description: "Filter by species (e.g., ['Mus musculus', 'Rattus norvegicus'])"
              },
              approach: {
                type: "array",
                items: { type: "string" },
                description: "Filter by experimental approach (e.g., ['electrophysiology'])"
              },
              measurement_technique: {
                type: "array", 
                items: { type: "string" },
                description: "Filter by measurement technique (e.g., ['extracellular electrophysiology'])"
              },
              anatomy: {
                type: "array",
                items: { type: "string" },
                description: "Filter by anatomical region (e.g., ['hippocampus', 'cortex'])"
              },
              limit: {
                type: "number",
                description: "Maximum number of results (default: 20, max: 100)",
                minimum: 1,
                maximum: 100
              },
              offset: {
                type: "number",
                description: "Number of results to skip for pagination",
                minimum: 0
              }
            }
          }
        },
        {
          name: "search_assets",
          description: "Search DANDI assets (files/sessions) using basic filters",
          inputSchema: {
            type: "object",
            properties: {
              dandiset_id: {
                type: "number",
                description: "Filter by specific dataset ID"
              },
              session_type: {
                type: "array",
                items: { type: "string" },
                description: "Filter by session type"
              },
              variable_measured: {
                type: "array",
                items: { type: "string" },
                description: "Filter by variables measured (e.g., ['ElectricalSeries'])"
              },
              species: {
                type: "array",
                items: { type: "string" },
                description: "Filter by species"
              },
              limit: {
                type: "number", 
                description: "Maximum number of results (default: 20, max: 100)",
                minimum: 1,
                maximum: 100
              },
              offset: {
                type: "number",
                description: "Number of results to skip for pagination",
                minimum: 0
              }
            }
          }
        },
        {
          name: "execute_sql",
          description: "Execute advanced SQL queries against the DANDI database",
          inputSchema: {
            type: "object",
            properties: {
              sql: {
                type: "string",
                description: "SQL query to execute (SELECT statements only, max 10,000 chars)"
              }
            },
            required: ["sql"]
          }
        },
        {
          name: "validate_sql",
          description: "Validate SQL query without executing it",
          inputSchema: {
            type: "object",
            properties: {
              sql: {
                type: "string",
                description: "SQL query to validate"
              }
            },
            required: ["sql"]
          }
        },
        {
          name: "get_schema",
          description: "Get database schema information",
          inputSchema: {
            type: "object",
            properties: {
              table: {
                type: "string",
                description: "Specific table name to get details for (optional)"
              }
            }
          }
        },
        {
          name: "get_filter_options",
          description: "Get available filter options for basic search",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "get_full_schema",
          description: "Get complete database schema with all tables and their columns",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "search_datasets":
          return await this.handleSearchDatasets(request.params.arguments as DandiSearchParams);
        
        case "search_assets":
          return await this.handleSearchAssets(request.params.arguments as DandiSearchParams);
        
        case "execute_sql":
          return await this.handleExecuteSql(request.params.arguments as unknown as SqlQueryParams);
        
        case "validate_sql":
          return await this.handleValidateSql(request.params.arguments as unknown as SqlQueryParams);
        
        case "get_schema":
          return await this.handleGetSchema(request.params.arguments as SchemaQueryParams);
        
        case "get_filter_options":
          return await this.handleGetFilterOptions();

        case "get_full_schema":
          return await this.handleGetFullSchema();

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
      }
    });
  }

  /**
   * Tool handler implementations
   */
  private async handleSearchDatasets(params: DandiSearchParams) {
    try {
      const searchParams = new URLSearchParams();
      
      if (params.name) searchParams.append('name', params.name);
      if (params.description) searchParams.append('description', params.description);
      if (params.species) params.species.forEach(s => searchParams.append('species', s));
      if (params.approach) params.approach.forEach(a => searchParams.append('approach', a));
      if (params.measurement_technique) params.measurement_technique.forEach(m => searchParams.append('measurement_technique', m));
      if (params.anatomy) params.anatomy.forEach(a => searchParams.append('anatomy', a));
      if (params.limit) searchParams.append('limit', params.limit.toString());
      if (params.offset) searchParams.append('offset', params.offset.toString());

      const response = await this.axiosInstance.get(`/api/search/?${searchParams.toString()}`);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            results: response.data.results,
            total: response.data.count,
            message: `Found ${response.data.count} datasets`
          }, null, 2)
        }]
      };
    } catch (error) {
      return this.handleError(error, "Dataset search failed");
    }
  }

  private async handleSearchAssets(params: DandiSearchParams) {
    try {
      const searchParams = new URLSearchParams();
      
      if (params.dandiset_id) searchParams.append('dandiset_id', params.dandiset_id.toString());
      if (params.session_type) params.session_type.forEach(s => searchParams.append('session_type', s));
      if (params.variable_measured) params.variable_measured.forEach(v => searchParams.append('variable_measured', v));
      if (params.species) params.species.forEach(s => searchParams.append('species', s));
      if (params.limit) searchParams.append('limit', params.limit.toString());
      if (params.offset) searchParams.append('offset', params.offset.toString());

      const response = await this.axiosInstance.get(`/api/assets/search/?${searchParams.toString()}`);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            results: response.data.results,
            total: response.data.count,
            message: `Found ${response.data.count} assets`
          }, null, 2)
        }]
      };
    } catch (error) {
      return this.handleError(error, "Asset search failed");
    }
  }

  private async handleExecuteSql(params: SqlQueryParams) {
    try {
      const response = await this.axiosInstance.post('/api/sql/execute/', {
        sql: params.sql
      });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response.data, null, 2)
        }]
      };
    } catch (error) {
      return this.handleError(error, "SQL execution failed");
    }
  }

  private async handleValidateSql(params: SqlQueryParams) {
    try {
      const response = await this.axiosInstance.post('/api/sql/validate/', {
        sql: params.sql
      });
      
      return {
        content: [{
          type: "text", 
          text: JSON.stringify(response.data, null, 2)
        }]
      };
    } catch (error) {
      return this.handleError(error, "SQL validation failed");
    }
  }

  private async handleGetSchema(params: SchemaQueryParams) {
    try {
      const url = params.table ? `/api/sql/schema/?table=${params.table}` : '/api/sql/schema/';
      const response = await this.axiosInstance.get(url);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response.data, null, 2)
        }]
      };
    } catch (error) {
      return this.handleError(error, "Schema query failed");
    }
  }

  private async handleGetFilterOptions() {
    try {
      const response = await this.axiosInstance.get('/api/filter-options/');
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response.data, null, 2)
        }]
      };
    } catch (error) {
      return this.handleError(error, "Filter options query failed");
    }
  }

  private async handleGetFullSchema() {
    try {
      // First, get the list of all tables
      const tablesResponse = await this.axiosInstance.get('/api/sql/schema/');
      
      if (!tablesResponse.data.allowed_tables) {
        throw new Error("No table list found in schema response");
      }

      const fullSchema: Record<string, any> = {};
      
      // Get schema for each table
      for (const tableName of tablesResponse.data.allowed_tables) {
        try {
          const tableResponse = await this.axiosInstance.get(`/api/sql/schema/?table=${tableName}`);
          fullSchema[tableName] = tableResponse.data;
        } catch (tableError) {
          console.warn(`Failed to get schema for table ${tableName}:`, tableError);
          fullSchema[tableName] = { error: `Failed to fetch schema for ${tableName}` };
        }
      }
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            schema: fullSchema,
            table_count: Object.keys(fullSchema).length,
            message: `Retrieved schema for ${Object.keys(fullSchema).length} tables`
          }, null, 2)
        }]
      };
    } catch (error) {
      return this.handleError(error, "Full schema query failed");
    }
  }

  /**
   * Error handling helper
   */
  private handleError(error: any, message: string) {
    console.error(`[DANDI Query Error] ${message}:`, error);
    
    let errorMessage = message;
    if (axios.isAxiosError(error)) {
      errorMessage += `: ${error.response?.data?.message || error.response?.data?.error || error.message}`;
    } else {
      errorMessage += `: ${error.message || 'Unknown error'}`;
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          error: errorMessage
        }, null, 2)
      }],
      isError: true
    };
  }

  /**
   * Documentation content generators
   */
  private getBasicSearchGuide(): string {
    return `# Basic Search Guide

The basic search functionality allows you to filter DANDI datasets and assets using predefined criteria.

## Searching Datasets

Use the \`search_datasets\` tool to find datasets matching specific criteria:

\`\`\`
{
  "name": "mouse",
  "species": ["Mus musculus"],
  "approach": ["electrophysiology"],
  "limit": 10
}
\`\`\`

### Available Filters:
- **name**: Search in dataset names
- **description**: Search in dataset descriptions  
- **species**: Filter by species (array)
- **approach**: Filter by experimental approach (array)
- **measurement_technique**: Filter by measurement techniques (array)
- **anatomy**: Filter by anatomical regions (array)
- **limit**: Maximum results (1-100, default 20)
- **offset**: Skip results for pagination

## Searching Assets

Use the \`search_assets\` tool to find specific files/sessions:

\`\`\`
{
  "variable_measured": ["ElectricalSeries"],
  "species": ["Mus musculus"],
  "limit": 50
}
\`\`\`

### Additional Asset Filters:
- **dandiset_id**: Filter by specific dataset ID
- **session_type**: Filter by session type (array)
- **variable_measured**: Filter by measured variables (array)

## Getting Filter Options

Use \`get_filter_options\` to see all available filter values:

\`\`\`
{}
\`\`\`

This returns lists of valid species, approaches, anatomical regions, etc.
`;
  }

  private getSqlQueryGuide(): string {
    return `# SQL Query Guide

The SQL query functionality provides maximum flexibility for complex data analysis.

## Security Features

- Only SELECT statements allowed
- Access limited to DANDI tables only
- Query complexity limits enforced
- Automatic result limits (max 1000 rows)
- SQL injection prevention

## Available Tables

### Core Tables:
- \`dandisets_dandiset\` - Dataset metadata
- \`dandisets_asset\` - Individual files/sessions
- \`dandisets_participant\` - Subject information
- \`dandisets_assetdandiset\` - Asset-dataset relationships
- \`dandisets_assetwasattributedto\` - Asset-participant relationships

### Reference Tables:
- \`dandisets_species\` - Species information
- \`dandisets_anatomy\` - Anatomical regions
- \`dandisets_approach\` - Experimental approaches
- \`dandisets_measurementtechnique\` - Measurement methods

## Query Tools

### execute_sql
Execute SQL queries directly:
\`\`\`
{
  "sql": "SELECT id, name FROM dandisets_dandiset WHERE name ILIKE '%mouse%' LIMIT 10"
}
\`\`\`

### validate_sql
Check query validity without execution:
\`\`\`
{
  "sql": "SELECT * FROM dandisets_dandiset"
}
\`\`\`

### get_schema
Get table structure information:
\`\`\`
{
  "table": "dandisets_dandiset"
}
\`\`\`

## Best Practices

1. Use LIMIT clauses to avoid large result sets
2. Filter early with WHERE clauses
3. Test complex queries with validate_sql first
4. Use JOINs efficiently
5. Leverage indexes on id, name, created_at fields
`;
  }

  private getSchemaGuide(): string {
    return `# Database Schema Reference

## Core Tables

### dandisets_dandiset
Main dataset table containing metadata about each DANDI dataset.

**Key Fields:**
- \`id\` (integer) - Unique dataset identifier
- \`name\` (text) - Dataset name
- \`description\` (text) - Dataset description
- \`created_at\` (timestamp) - Creation date
- \`modified_at\` (timestamp) - Last modification date

### dandisets_asset  
Individual files/sessions within datasets.

**Key Fields:**
- \`id\` (integer) - Unique asset identifier
- \`path\` (text) - File path within dataset
- \`size\` (bigint) - File size in bytes
- \`variable_measured\` (jsonb) - Array of measured variables
- \`session_description\` (text) - Session description
- \`session_start_time\` (timestamp) - Session start time

### dandisets_participant
Subject/participant information.

**Key Fields:**
- \`id\` (integer) - Unique participant identifier
- \`participant_id\` (text) - Participant identifier within dataset
- \`species_id\` (integer) - Foreign key to species table
- \`sex_id\` (integer) - Foreign key to sex table
- \`age\` (text) - Subject age information

## Relationship Tables

### dandisets_assetdandiset
Links assets to datasets (many-to-many).

**Fields:**
- \`asset_id\` (integer) - Foreign key to asset
- \`dandiset_id\` (integer) - Foreign key to dataset

### dandisets_assetwasattributedto
Links assets to participants (many-to-many).

**Fields:**
- \`asset_id\` (integer) - Foreign key to asset  
- \`participant_id\` (integer) - Foreign key to participant

## Reference Tables

### dandisets_species
Species taxonomy information.

### dandisets_anatomy
Anatomical region ontology.

### dandisets_approach
Experimental approach classifications.

### dandisets_measurementtechnique
Measurement technique classifications.

Use \`get_schema\` tool with a table name to get detailed column information.
`;
  }

  private getBasicSearchExamples() {
    return {
      "examples": [
        {
          "name": "Find mouse electrophysiology datasets",
          "tool": "search_datasets",
          "params": {
            "species": ["Mus musculus"],
            "approach": ["electrophysiology"],
            "limit": 20
          }
        },
        {
          "name": "Search for hippocampus recordings",
          "tool": "search_datasets", 
          "params": {
            "anatomy": ["hippocampus"],
            "measurement_technique": ["extracellular electrophysiology"]
          }
        },
        {
          "name": "Find assets with ElectricalSeries data",
          "tool": "search_assets",
          "params": {
            "variable_measured": ["ElectricalSeries"],
            "limit": 50
          }
        },
        {
          "name": "Get assets from specific dataset",
          "tool": "search_assets",
          "params": {
            "dandiset_id": 124,
            "limit": 100
          }
        }
      ]
    };
  }

  private getSqlQueryExamples() {
    return {
      "examples": [
        {
          "name": "Simple dataset search",
          "sql": "SELECT id, name, description FROM dandisets_dandiset WHERE name ILIKE '%mouse%' ORDER BY name LIMIT 20"
        },
        {
          "name": "Count datasets by species",
          "sql": "SELECT s.genus_species, COUNT(DISTINCT d.id) as dataset_count FROM dandisets_dandiset d JOIN dandisets_assetdandiset ad ON d.id = ad.dandiset_id JOIN dandisets_asset a ON ad.asset_id = a.id JOIN dandisets_assetwasattributedto awo ON a.id = awo.asset_id JOIN dandisets_participant p ON awo.participant_id = p.id JOIN dandisets_species s ON p.species_id = s.id GROUP BY s.genus_species ORDER BY dataset_count DESC"
        },
        {
          "name": "Find datasets with multiple subjects having multiple sessions",
          "sql": "SELECT d.id, d.name, qualified_subjects.subject_count FROM dandisets_dandiset d JOIN (SELECT sessions_per_subject.dandiset_id, COUNT(DISTINCT sessions_per_subject.participant_id) as subject_count FROM (SELECT ad.dandiset_id, awo.participant_id, COUNT(*) as session_count FROM dandisets_asset a JOIN dandisets_assetdandiset ad ON a.id = ad.asset_id JOIN dandisets_assetwasattributedto awo ON a.id = awo.asset_id WHERE UPPER(a.variable_measured::text) LIKE UPPER('%ElectricalSeries%') GROUP BY ad.dandiset_id, awo.participant_id HAVING COUNT(*) >= 3) sessions_per_subject GROUP BY sessions_per_subject.dandiset_id HAVING COUNT(DISTINCT sessions_per_subject.participant_id) >= 3) qualified_subjects ON d.id = qualified_subjects.dandiset_id ORDER BY qualified_subjects.subject_count DESC"
        },
        {
          "name": "Analyze variable measurements",
          "sql": "SELECT a.variable_measured, COUNT(*) as asset_count, COUNT(DISTINCT ad.dandiset_id) as dataset_count FROM dandisets_asset a JOIN dandisets_assetdandiset ad ON a.id = ad.asset_id WHERE a.variable_measured IS NOT NULL GROUP BY a.variable_measured ORDER BY asset_count DESC LIMIT 20"
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('DANDI Query MCP server running on stdio');
  }
}

const server = new DandiQueryServer();
server.run().catch(console.error);
