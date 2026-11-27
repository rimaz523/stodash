variable "project" {
  default     = "stodash"
  description = "Name of the project."
}

variable "environment" {
  default     = "dev"
  description = "The deployed environment."
}

variable "subscription_id" {
  default     = "#{subscription_id}#"
  description = "The azure subscription id."
}

variable "resource_groups" {
  description = "create resource groups in the project's environment"
  type = map(object({
    location = string
  }))
  default = {
    "app" = {
      location = "australiaeast"
    }
    "data" = {
      location = "australiaeast"
    }
  }
}

variable "linux_webapps" {
  description = "A map of linux web apps to create."
  type = map(object({
    stack         = string
    stack_version = string
    always_on     = bool
  }))
    default = {
        "react" = {
      stack         = "node"
      stack_version = "26"
      always_on     = true
    },
    "api" = {
      stack         = "dotnet"
      stack_version = "10.0"
      always_on     = true
    }
    }
}