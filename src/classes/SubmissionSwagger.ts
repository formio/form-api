import utils from 'formiojs/utils';

import {Model} from '../dbs';
import {ResourceSwagger} from './ResourceSwagger';

export class SubmissionSwagger extends ResourceSwagger {
  private submissionDataName: string;

  constructor(
    baseRoute: string,
    protected name: string,
    protected methods: string[],
    protected model: Model,
    protected form: any,
    protected id: string = null,
  ) {
    super(baseRoute, name, methods, model, id);
    this.name = `${name}Submission`;
    this.submissionDataName = `${this.name}Data`;
  }

  public getJson() {
    const json = super.getJson();

    json.components.schemas[this.submissionDataName] = {
      ...this.getSubmissionDataSchema(),
    };

    return json;
  }

  protected getSchema() {
    const schemas = super.getSchema();

    schemas[this.name].required.push('data');
    schemas[this.name].properties.data = {
      $ref: `#/components/schemas/${this.submissionDataName}`,
    };

    return {
      ...schemas,
      ...this.getAddressComponentSchemas(),
    };
  }

  private getSubmissionDataSchema() {
    const schema = {
      properties: {},
      required: [],
    };

    utils.eachComponent(this.form.components, (component: any) => {
      if (!component.key) {
        return;
      }

      const property = this.getComponentProperty(
        component,
        {multiple: component.multiple},
      );

      if (property) {
        schema.properties[component.key] = property;
      }

      if (component.validate && component.validate.required) {
        schema.required.push(component.key);
      }
    });

    // We should delete it because OpenAPI spec doesn't allow empty array of required
    if (schema.required.length === 0) {
      delete schema.required;
    }

    return schema;
  }

  private getComponentProperty(component: any, options: any) {
    let property: any;
    let datagrid = {
      type: 'object',
      properties: {},
      required: [],
    };

    switch (component.type) {
      case 'email':
      case 'textfield':
      case 'password':
      case 'phonenumber':
      case 'select':
      case 'radio':
      case 'textarea':
        property = {
          type: 'string',
        };
        break;
      case 'number':
        property = {
          type: 'integer',
          format: 'int64',
        };
        break;
      case 'datetime':
        property = {
          type: 'string',
          format: 'date',
        };
        break;
      case 'address':
        property = {
          $ref: '#/components/schemas/address',
        };
        break;
      case 'checkbox':
        property = {
          type: 'boolean',
        };
        break;
      case 'selectboxes':
        property = {
          type: 'array',
          items: {
            type: 'string',
          },
        };
        break;
      case 'resource':
        property = {
          type: 'string',
          description: 'ObjectId',
        };
        break;
      case 'datagrid':
        utils.eachComponent(component.components, (component: any) => {
          if (!component.key) {
            return;
          }

          const property = this.getComponentProperty(
            component,
            { multiple: component.multiple },
          );

          if (property) {
            datagrid.properties[component.key] = property;
          }

          if (component.validate && component.validate.required) {
            datagrid.required.push(component.key);
          }
        });

        // We should delete it because OpenAPI spec doesn't allow empty array of required
        if (datagrid.required.length === 0) {
          delete datagrid.required;
        }
        property = {
          type: 'array',
          items: datagrid
        };
        // Prevent eachComponent from going through these components again
        component.components = [];
        break;
      case 'custom':
        property = {
          type: 'object',
        };
        break;
      case 'button':
        property = false;
        break;
      default:
        property = {
          type: 'string',
        };
    }

    if (property && options.multiple) {
      property = {
        type: 'array',
        items: property,
      };
    }

    return property;
  }

  private getAddressComponentSchemas() {
    return {
      address: {
        properties: {
          address_components: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/address_components',
            },
          },
          formatted_address: {
            type: 'string',
          },
          geometry: {
            $ref: '#/components/schemas/address_geometry',
          },
          place_id: {
            type: 'string',
          },
          types: {
            type: 'array',
              items: {
              type: 'string',
            },
          },
        },
      },
      address_components: {
        properties: {
          long_name: {
            type: 'string',
          },
          short_name: {
            type: 'string',
          },
          types: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      },
      location: {
        properties: {
          lat: {
            type: 'number',
            format: 'float',
          },
          lng: {
            type: 'number',
            format: 'float',
          },
        },
      },
      viewport: {
        properties: {
          northeast: {
            $ref: '#/components/schemas/location',
          },
          southwest: {
            $ref: '#/components/schemas/location',
          },
        },
      },
      address_geometry: {
        properties: {
          location: {
            $ref: '#/components/schemas/location',
          },
          location_type: {
            type: 'string',
          },
          viewport: {
            $ref: '#/components/schemas/viewport',
          },
        },
      },
    };
  }
}
