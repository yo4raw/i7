import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCardById, getSkillDetails } from '$lib/db';

export const GET: RequestHandler = async ({ params }) => {
  const id = parseInt(params.id);
  
  if (isNaN(id)) {
    return json({
      success: false,
      error: 'Invalid card ID'
    }, { status: 400 });
  }
  
  try {
    const card = await getCardById(id);
    
    if (!card) {
      return json({
        success: false,
        error: 'Card not found'
      }, { status: 404 });
    }
    
    const skillDetails = await getSkillDetails(id);
    
    return json({
      success: true,
      data: {
        ...card,
        skillDetails
      }
    });
  } catch (error) {
    return json({
      success: false,
      error: 'Failed to fetch card details'
    }, { status: 500 });
  }
};