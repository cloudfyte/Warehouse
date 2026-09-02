import graphene
from graphql import GraphQLError
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile
from warehouse.permissions import accessible_warehouses, require_role
from warehouse.services.production import (
    create_cutting_assignment, create_finished_products, create_product_matrix,
    create_stitching_job, update_cutting_assignment, update_finished_product,
    update_stitching_job,
)
from warehouse.schema.types import CuttingAssignmentType, FinishedProductType, StitchingJobType


class CreateCuttingAssignment(graphene.Mutation):
    class Arguments:
        raw_cloth_batch_id = graphene.ID(required=True)
        cutting_master_id = graphene.ID(required=True)
        item_type_id = graphene.ID(required=True)
        meters_assigned = graphene.Float(required=True)
        target_pieces = graphene.Int(required=True)
        age_group = graphene.String()
        size = graphene.String()
        assigned_date = graphene.Date()
        due_date = graphene.Date()
        notes = graphene.String()

    assignment = graphene.Field(CuttingAssignmentType)

    @login_required
    def mutate(self, info, raw_cloth_batch_id, cutting_master_id, item_type_id, meters_assigned, target_pieces, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return CreateCuttingAssignment(assignment=create_cutting_assignment(
            user=info.context.user, raw_cloth_batch_id=raw_cloth_batch_id,
            cutting_master_id=cutting_master_id, item_type_id=item_type_id,
            meters_assigned=meters_assigned, target_pieces=target_pieces, **kwargs,
        ))


class UpdateCuttingAssignment(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        status = graphene.String()
        pieces_completed = graphene.Int()
        cloth_used = graphene.Float()
        cloth_wasted = graphene.Float()
        completed_date = graphene.Date()
        notes = graphene.String()

    assignment = graphene.Field(CuttingAssignmentType)

    @login_required
    def mutate(self, info, id, **kwargs):
        profile = require_role(
            info.context.user,
            EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
            EmployeeProfile.Role.CUTTING_MASTER,
        )
        return UpdateCuttingAssignment(assignment=update_cutting_assignment(id=id, **kwargs))


class CreateStitchingJob(graphene.Mutation):
    class Arguments:
        cutting_assignment_id = graphene.ID(required=True)
        tailor_id = graphene.ID(required=True)
        pieces_assigned = graphene.Int(required=True)
        assigned_date = graphene.Date()
        due_date = graphene.Date()
        notes = graphene.String()

    job = graphene.Field(StitchingJobType)

    @login_required
    def mutate(self, info, cutting_assignment_id, tailor_id, pieces_assigned, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER)
        return CreateStitchingJob(job=create_stitching_job(
            user=info.context.user, cutting_assignment_id=cutting_assignment_id,
            tailor_id=tailor_id, pieces_assigned=pieces_assigned, **kwargs,
        ))


class UpdateStitchingJob(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        status = graphene.String()
        pieces_completed = graphene.Int()
        pieces_rejected = graphene.Int()
        completed_date = graphene.Date()
        notes = graphene.String()

    job = graphene.Field(StitchingJobType)

    @login_required
    def mutate(self, info, id, **kwargs):
        require_role(
            info.context.user,
            EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER,
            EmployeeProfile.Role.TAILOR,
        )
        return UpdateStitchingJob(job=update_stitching_job(id=id, **kwargs))


class UpdateFinishedProduct(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)
        tags_printed = graphene.Boolean()
        sale_price = graphene.Float()
        cost_price = graphene.Float()
        size = graphene.String()
        age_group = graphene.String()
        cloth_color_id = graphene.ID()
        cloth_category_id = graphene.ID()
        item_type_id = graphene.ID()

    finished_product = graphene.Field(FinishedProductType)

    @login_required
    def mutate(self, info, id, **kwargs):
        return UpdateFinishedProduct(
            finished_product=update_finished_product(
                user=info.context.user, id=id, **kwargs))


class CreateFinishedProducts(graphene.Mutation):
    class Arguments:
        item_type_id = graphene.ID()
        stitching_job_id = graphene.ID()
        readymade_stock_id = graphene.ID()
        cloth_category_id = graphene.ID()
        cloth_color_id = graphene.ID()
        age_group = graphene.String()
        size = graphene.String()
        quantity = graphene.Int(required=True)
        warehouse_id = graphene.ID(required=True)
        cost_price = graphene.Float(required=True)
        sale_price = graphene.Float(required=True)

    finished_product = graphene.Field(FinishedProductType)

    @login_required
    def mutate(self, info, quantity, warehouse_id, cost_price, sale_price, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN, EmployeeProfile.Role.MANAGER, EmployeeProfile.Role.STORE_KEEPER)
        return CreateFinishedProducts(finished_product=create_finished_products(
            user=info.context.user, quantity=quantity, warehouse_id=warehouse_id,
            cost_price=cost_price, sale_price=sale_price, **kwargs,
        ))


class VariantOptionInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    value = graphene.String(required=True)


class VariantRowInput(graphene.InputObjectType):
    options = graphene.List(graphene.NonNull(VariantOptionInput), required=True)
    quantity = graphene.Int()
    cost_price = graphene.Float()
    sale_price = graphene.Float()


class CreateProductMatrix(graphene.Mutation):
    """Create one finished product per dimension combination in a single action."""
    class Arguments:
        item_type_id = graphene.ID(required=True)
        warehouse_id = graphene.ID(required=True)
        cloth_category_id = graphene.ID()
        source = graphene.String()
        rows = graphene.List(graphene.NonNull(VariantRowInput), required=True)

    finished_products = graphene.List(FinishedProductType)

    @login_required
    def mutate(self, info, item_type_id, warehouse_id, rows, **kwargs):
        products = create_product_matrix(
            user=info.context.user,
            item_type_id=item_type_id,
            warehouse_id=warehouse_id,
            rows=[{
                "options": [dict(o) for o in (r.options or [])],
                "quantity": r.quantity,
                "cost_price": r.cost_price,
                "sale_price": r.sale_price,
            } for r in rows],
            **kwargs,
        )
        return CreateProductMatrix(finished_products=products)
