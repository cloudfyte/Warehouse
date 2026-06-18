import graphene

from .damage import ReportDamage, ResolveDamage
from .employee import CreateEmployee, ResetEmployeePassword, UpdateEmployee
from .notifications import MarkNotificationsRead
from .replenishment import RequestReplenishment, UpdateReplenishmentStatus
from .returns import CreateReturn
from .settings import UpdateSystemSettings
from .stock import CreateProduct, UpdateStock
from .vendor import CreateVendor, UpdateVendor
from .warehouse import CreateWarehouseLocation, UpdateWarehouseLocation


class Mutation(graphene.ObjectType):
    create_vendor = CreateVendor.Field()
    update_vendor = UpdateVendor.Field()
    create_product = CreateProduct.Field()
    update_stock = UpdateStock.Field()
    create_return = CreateReturn.Field()
    report_damage = ReportDamage.Field()
    resolve_damage = ResolveDamage.Field()
    create_warehouse_location = CreateWarehouseLocation.Field()
    update_warehouse_location = UpdateWarehouseLocation.Field()
    create_employee = CreateEmployee.Field()
    update_employee = UpdateEmployee.Field()
    reset_employee_password = ResetEmployeePassword.Field()
    request_replenishment = RequestReplenishment.Field()
    update_replenishment_status = UpdateReplenishmentStatus.Field()
    mark_notifications_read = MarkNotificationsRead.Field()
    update_system_settings = UpdateSystemSettings.Field()
